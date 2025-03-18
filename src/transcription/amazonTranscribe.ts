import * as fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Timestamp, retry } from '../utils';
import { TranscriptionService } from './types';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';

// Initialize AWS services with v3 SDK
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

const transcribeClient = new TranscribeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

export class AmazonTranscribeService implements TranscriptionService {
    async transcribe(audioPath: string): Promise<Timestamp[]> {
        return retry(async () => {
            return await this.transcribeWithAmazon(audioPath);
        });
    }

    private async transcribeWithAmazon(audioPath: string): Promise<Timestamp[]> {
        console.log('Using Amazon Transcribe for transcription...');
        
        // Upload file to S3 (required for Amazon Transcribe)
        const bucketName = process.env.AWS_S3_BUCKET!;
        const audioFileName = path.basename(audioPath);
        const jobName = `job-${randomUUID()}`;
        const s3Key = `test-processor-transcription/${jobName}_${audioFileName}`;
        const outputKey = `outputs/${jobName}/transcript.json`;
        let uploadedToS3 = false;
        let filesCreated: string[] = [];
        
        // Ensure S3 bucket exists
        try {
            await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
        } catch (error: any) {
            throw new Error(`S3 bucket error: ${error.message}`);
        }
        
        try {
            // Upload audio file to S3
            console.log(`Uploading audio to S3 bucket '${bucketName}'...`);
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                Body: fs.createReadStream(audioPath)
            }));
            uploadedToS3 = true;
            filesCreated.push(s3Key);
            
            // Start transcription job
            console.log(`Starting Amazon Transcribe job '${jobName}'...`);
            await transcribeClient.send(new StartTranscriptionJobCommand({
                TranscriptionJobName: jobName,
                IdentifyLanguage: true, // Added language identification for auto detection
                Media: {
                    MediaFileUri: `s3://${bucketName}/${s3Key}`
                },
                OutputBucketName: bucketName,
                OutputKey: outputKey
            }));
            
            // Poll for job completion
            console.log('Waiting for transcription to complete...');
            let completed = false;
            let transcript = null;

            while (!completed) {
                const jobStatus = await transcribeClient.send(new GetTranscriptionJobCommand({
                    TranscriptionJobName: jobName
                }));

                if (['COMPLETED', 'FAILED'].includes(jobStatus.TranscriptionJob?.TranscriptionJobStatus || '')) {
                    completed = true;
                    if (jobStatus.TranscriptionJob?.TranscriptionJobStatus === 'COMPLETED') {
                        // Download transcript from S3
                        console.log('Transcription complete, downloading transcript...');
                        filesCreated.push(outputKey);
                        const response = await s3Client.send(new GetObjectCommand({
                            Bucket: bucketName,
                            Key: outputKey
                        }));

                        // Convert stream to string
                        const body = await this.streamToString(response.Body);
                        transcript = JSON.parse(body);
                    } else {
                        throw new Error('Transcription job failed');
                    }
                } else {
                    console.log(`Transcription in progress (status: ${jobStatus.TranscriptionJob?.TranscriptionJobStatus}), waiting 5 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            if (!transcript || !transcript.results || !transcript.results.items) {
                throw new Error('Invalid transcript format received from Amazon Transcribe');
            }
            
            // Convert Amazon Transcribe format to our Timestamp format
            const timestamps = this.convertAmazonTranscriptToTimestamps(transcript);
            
            // Cleanup S3 files
            console.log('Cleaning up S3 files...');
            await this.cleanupS3Files(bucketName, filesCreated);
            
            return timestamps;
        } catch (error) {
            // If an error occurs, still try to delete uploaded files
            if (uploadedToS3 && filesCreated.length > 0) {
                console.log('Error occurred, cleaning up S3 files...');
                try {
                    await this.cleanupS3Files(bucketName, filesCreated);
                } catch (cleanupError) {
                    console.error('Error during S3 cleanup:', cleanupError);
                }
            }
            
            // Re-throw the original error
            throw error;
        }
    }

    // Helper method to convert readable stream to string
    private async streamToString(stream: any): Promise<string> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
    }

    // Helper method to clean up S3 files
    private async cleanupS3Files(bucketName: string, keys: string[]): Promise<void> {
        if (!keys || keys.length === 0) return;
        
        try {
            // Delete the individual files
            console.log(`Cleaning up ${keys.length} S3 objects...`);
            for (const key of keys) {
                try {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: key
                    }));
                } catch (error) {
                    console.warn(`Failed to delete S3 object ${key}:`, error);
                    // Continue with other deletions even if one fails
                }
            }
            
            console.log('S3 cleanup completed.');
        } catch (error) {
            console.error('Error during S3 cleanup:', error);
            throw error;
        }
    }

    // Helper function to convert Amazon Transcribe format to our Timestamp format
    private convertAmazonTranscriptToTimestamps(transcript: any): Timestamp[] {
        const items = transcript.results.items;
        const segments: Timestamp[] = [];
        let currentSegment: Timestamp = {
            start: 0,
            end: 0,
            text: ''
        };

        let sentenceStart = true;
        let currentWords: string[] = [];
        let currentStartTime = 0;
        let currentEndTime = 0;

        // Group words into sentences
        items.forEach((item: any, index: number) => {
            if (item.type === 'pronunciation') {
                const startTime = parseFloat(item.start_time);
                const endTime = parseFloat(item.end_time);
                
                // Set start time for new segment
                if (sentenceStart) {
                    currentStartTime = startTime;
                    sentenceStart = false;
                }

                // Update end time with latest word
                currentEndTime = endTime;
                
                // Add word to current sentence
                currentWords.push(item.alternatives[0].content);
            } else if (item.type === 'punctuation') {
                // Add punctuation to the last word
                if (currentWords.length > 0) {
                    currentWords[currentWords.length - 1] += item.alternatives[0].content;
                }
                
                // If the punctuation is a period, question mark, or exclamation mark, finish the segment
                if (['.', '?', '!'].includes(item.alternatives[0].content)) {
                    currentSegment = {
                        start: currentStartTime,
                        end: currentEndTime,
                        text: currentWords.join(' ')
                    };
                    
                    segments.push(currentSegment);
                    
                    // Reset for next segment
                    currentWords = [];
                    sentenceStart = true;
                }
            }
            
            // If we've accumulated 15+ words without punctuation, create a segment anyway
            if (currentWords.length >= 15 && !sentenceStart) {
                currentSegment = {
                    start: currentStartTime,
                    end: currentEndTime,
                    text: currentWords.join(' ')
                };
                
                segments.push(currentSegment);
                
                // Reset for next segment
                currentWords = [];
                sentenceStart = true;
            }
            
            // Add final segment if there are any words left
            if (index === items.length - 1 && currentWords.length > 0) {
                currentSegment = {
                    start: currentStartTime,
                    end: currentEndTime,
                    text: currentWords.join(' ')
                };
                
                segments.push(currentSegment);
            }
        });

        return segments;
    }
} 