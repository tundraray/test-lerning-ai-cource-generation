import { Timestamp } from '../utils';

export enum TranscriptionServiceType {
    OPENAI_WHISPER = 'openai',
    AMAZON_TRANSCRIBE = 'amazon',
    ASSEMBLY_AI = 'assemblyai',
    GEMINI = 'gemini'
}

export interface TranscriptionService {
    transcribe(audioPath: string): Promise<Timestamp[]>;
} 