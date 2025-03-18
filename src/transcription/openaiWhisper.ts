import * as fs from 'fs';
import OpenAI from 'openai';
import { Timestamp, retry } from '../utils';
import { TranscriptionService } from './types';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export class OpenAIWhisperService implements TranscriptionService {
    async transcribe(audioPath: string): Promise<Timestamp[]> {
        return retry(async () => {
            return await this.transcribeWithOpenAI(audioPath);
        });
    }

    private async transcribeWithOpenAI(audioPath: string): Promise<Timestamp[]> {
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
} 