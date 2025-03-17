import * as fs from 'fs';
import OpenAI from 'openai';
import AWS from 'aws-sdk';
import { randomUUID } from 'crypto';
import { Timestamp, retry } from './utils';
import path from 'path';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize AWS services
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

const s3 = new AWS.S3();
const transcribe = new AWS.TranscribeService();

export enum TranscriptionServiceType {
    OPENAI_WHISPER = 'openai',
    AMAZON_TRANSCRIBE = 'amazon'
}

export class TranscriptionService {
    // Transcribe audio using OpenAI Whisper
    static async transcribeWithOpenAI(audioPath: string): Promise<Timestamp[]> {
        console.log('Using OpenAI Whisper for transcription...');
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "verbose_json"
        });

        return (transcription.segments || []).map(segment => ({
            start: segment.start,
            end: segment.end,
            text: segment.text
        }));
    }

    // Transcribe audio using Amazon Transcribe
    static async transcribeWithAmazon(audioPath: string): Promise<Timestamp[]> {
        console.log('Using Amazon Transcribe for transcription...');
        
        // Upload file to S3 (required for Amazon Transcribe)
        const bucketName = process.env.AWS_S3_BUCKET || 'video-processor-transcription';
        const audioFileName = path.basename(audioPath);
        const jobName = `job-${randomUUID()}`;
        const s3Key = `uploads/${jobName}/${audioFileName}`;
        
        // Ensure S3 bucket exists
        try {
            await s3.headBucket({ Bucket: bucketName }).promise();
        } catch (error: any) {
            if (error.code === 'NotFound') {
                await s3.createBucket({ Bucket: bucketName }).promise();
            } else {
                throw new Error(`S3 bucket error: ${error.message}`);
            }
        }
        
        // Upload audio file to S3
        console.log(`Uploading audio to S3 bucket '${bucketName}'...`);
        await s3.upload({
            Bucket: bucketName,
            Key: s3Key,
            Body: fs.createReadStream(audioPath)
        }).promise();

        // Start transcription job
        console.log(`Starting Amazon Transcribe job '${jobName}'...`);
        await transcribe.startTranscriptionJob({
            TranscriptionJobName: jobName,
            LanguageCode: 'auto', // Auto language detection
            Media: {
                MediaFileUri: `s3://${bucketName}/${s3Key}`
            },
            OutputBucketName: bucketName,
            OutputKey: `outputs/${jobName}/transcript.json`
        }).promise();

        // Poll for job completion
        console.log('Waiting for transcription to complete...');
        let completed = false;
        let transcript = null;
        
        while (!completed) {
            const jobStatus = await transcribe.getTranscriptionJob({
                TranscriptionJobName: jobName
            }).promise();

            if (jobStatus.TranscriptionJob?.TranscriptionJobStatus === 'COMPLETED') {
                completed = true;
                
                // Download transcript from S3
                console.log('Transcription completed. Downloading results...');
                const outputKey = `outputs/${jobName}/transcript.json`;
                const s3Object = await s3.getObject({
                    Bucket: bucketName,
                    Key: outputKey
                }).promise();
                
                if (s3Object.Body) {
                    transcript = JSON.parse(s3Object.Body.toString());
                }
            } else if (jobStatus.TranscriptionJob?.TranscriptionJobStatus === 'FAILED') {
                throw new Error(`Transcription job failed: ${jobStatus.TranscriptionJob.FailureReason}`);
            } else {
                // Wait 5 seconds before checking again
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Parse Amazon Transcribe format into our Timestamp format
        if (!transcript || !transcript.results || !transcript.results.items) {
            throw new Error('Invalid transcript format received from Amazon Transcribe');
        }

        // Convert Amazon Transcribe format to our Timestamp format
        return convertAmazonTranscriptToTimestamps(transcript);
    }

    // Choose which service to use based on the service parameter
    static async transcribe(
        audioPath: string, 
        service: TranscriptionServiceType = TranscriptionServiceType.OPENAI_WHISPER
    ): Promise<Timestamp[]> {
        return retry(async () => {
            if (service === TranscriptionServiceType.AMAZON_TRANSCRIBE) {
                return await this.transcribeWithAmazon(audioPath);
            } else {
                return await this.transcribeWithOpenAI(audioPath);
            }
        });
    }
}

// Helper function to convert Amazon Transcribe format to our Timestamp format
function convertAmazonTranscriptToTimestamps(transcript: any): Timestamp[] {
    const items = transcript.results.items;
    const timestamps: Timestamp[] = [];
    
    let currentSegment: { text: string; start: number; end: number } | null = null;
    
    for (const item of items) {
        if (item.type === 'pronunciation') {
            const start = parseFloat(item.start_time);
            const end = parseFloat(item.end_time);
            const text = item.alternatives[0].content;
            
            if (!currentSegment) {
                currentSegment = { text, start, end };
            } else if (start - currentSegment.end < 1.0) {
                // If less than 1 second gap, consider it the same segment
                currentSegment.text += ` ${text}`;
                currentSegment.end = end;
            } else {
                timestamps.push(currentSegment);
                currentSegment = { text, start, end };
            }
        } else if (item.type === 'punctuation' && currentSegment) {
            currentSegment.text += item.alternatives[0].content;
        }
    }
    
    if (currentSegment) {
        timestamps.push(currentSegment);
    }
    
    return timestamps;
} 