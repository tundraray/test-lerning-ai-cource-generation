import * as fs from 'fs';
import * as path from 'path';
import { Timestamp, retry } from '../utils';
import { TranscriptionService } from './types';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import ffmpeg from 'fluent-ffmpeg';
import * as os from 'os';
import * as crypto from 'crypto';

export class GeminiTranscriptionService implements TranscriptionService {
    async transcribe(audioPath: string): Promise<Timestamp[]> {
        return retry(async () => {
            return await this.transcribeWithGemini(audioPath);
        });
    }

    private async transcribeWithGemini(audioPath: string): Promise<Timestamp[]> {
        console.log('Using Google Gemini for transcription...');
        
        // Initialize Google AI
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY environment variable is not set');
        }
        
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Use gemini-1.5-flash which supports audio files
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // Create a temporary file path for upload
        const tempDir = os.tmpdir();
        const randomId = crypto.randomBytes(16).toString('hex');
        const tempFilePath = path.join(tempDir, `audio-${randomId}.mp3`);
        
        try {
            // Get audio duration with ffmpeg
            const duration = await this.getAudioDuration(audioPath);
            
            // Copy the audio file to a temporary location
            console.log(`Copying audio file to temporary location: ${tempFilePath}`);
            await fs.promises.copyFile(audioPath, tempFilePath);
            
            // Read the temporary audio file and convert to base64
            const audioData = await fs.promises.readFile(tempFilePath);
            
            // Create FileData for Gemini API
            const fileData = {
                data: audioData.toString('base64'),
                mimeType: 'audio/mpeg'
            };
            
            // Create prompt for transcription
            const prompt = `
            Please transcribe this audio file with precise timestamps.
            
            The audio duration is approximately ${duration} seconds.
            
            Please format the transcription with timestamps in the following JSON format:
            [
                {
                    "start": 0.0,
                    "end": 2.5,
                    "text": "Hello, this is the beginning of the transcript."
                },
                {
                    "start": 2.5,
                    "end": 5.0,
                    "text": "This is the next segment with more speech."
                }
            ]
            
            Make sure to include:
            1. Start time in seconds for each segment
            2. End time in seconds for each segment
            3. Transcribed text for each segment
            
            Divide the text into logical segments (like sentences or phrases).
            Aim for segments of around 5-10 seconds each.
            `;
            
            // Create multimodal content parts
            const parts: Part[] = [
                { text: prompt },
                { inlineData: fileData }
            ];
            
            console.log('Sending audio file to Gemini...');
            const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
            const response = await result.response;
            const text = response.text();
            
            // Try to extract JSON array from response
            let jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                // If JSON extraction fails, create timestamps manually
                console.warn('Could not extract valid JSON from Gemini response, creating timestamps manually');
                
                // Generate basic text for transcription
                const segmentLength = 10; // Segment length in seconds
                const segments: Timestamp[] = [];
                let plainText = text.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, '').trim(); // Remove code blocks
                
                // Split text into paragraphs
                const paragraphs = plainText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                
                // Create segments with timestamps
                let currentTime = 0;
                for (const paragraph of paragraphs) {
                    const endTime = Math.min(currentTime + segmentLength, duration);
                    segments.push({
                        start: currentTime,
                        end: endTime,
                        text: paragraph.trim()
                    });
                    currentTime = endTime;
                }
                
                console.log(`Created ${segments.length} segments manually`);
                return segments;
            }
            
            try {
                const timestamps = JSON.parse(jsonMatch[0]);
                
                // Validate the format
                if (!Array.isArray(timestamps) || !timestamps.every(item => 
                    typeof item.start === 'number' && 
                    typeof item.end === 'number' && 
                    typeof item.text === 'string')) {
                    throw new Error('Invalid timestamp format in Gemini response');
                }
                
                console.log(`Successfully transcribed audio with Gemini (${timestamps.length} segments)`);
                return timestamps;
            } catch (parseError) {
                console.error('Error parsing Gemini response:', parseError);
                throw new Error('Failed to parse Gemini transcription response');
            }
        } catch (error: any) {
            console.error('Error in Gemini transcription:', error);
            throw new Error(`Gemini transcription failed: ${error.message}`);
        } finally {
            // Clean up the temporary file regardless of success or failure
            try {
                if (fs.existsSync(tempFilePath)) {
                    await fs.promises.unlink(tempFilePath);
                    console.log(`Removed temporary audio file: ${tempFilePath}`);
                }
            } catch (cleanupError) {
                console.warn('Failed to remove temporary audio file:', cleanupError);
            }
        }
    }
    
    /**
     * Gets the duration of the audio file in seconds
     */
    private async getAudioDuration(audioPath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(audioPath, (err, metadata) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (metadata && metadata.format && metadata.format.duration) {
                    resolve(Math.round(metadata.format.duration));
                } else {
                    // If we couldn't get the duration, return an approximate estimate
                    resolve(60); // 1 minute by default
                }
            });
        });
    }
} 