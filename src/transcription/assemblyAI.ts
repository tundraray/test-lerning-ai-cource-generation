import { AssemblyAI } from 'assemblyai';
import { Timestamp, retry } from '../utils';
import { TranscriptionService } from './types';

// Initialize AssemblyAI client
const assemblyai = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || ''
});

export class AssemblyAIService implements TranscriptionService {
    async transcribe(audioPath: string): Promise<Timestamp[]> {
        return retry(async () => {
            return await this.transcribeWithAssemblyAI(audioPath);
        });
    }

    private async transcribeWithAssemblyAI(audioPath: string): Promise<Timestamp[]> {
        console.log('Using AssemblyAI for transcription...');
        
        // Начинаем транскрипцию через AssemblyAI (поддерживает локальные файлы)
        const transcript = await assemblyai.transcripts.transcribe({
            audio: audioPath,
            punctuate: true,   // Добавляем пунктуацию
            format_text: true, // Добавляем форматирование текста
            disfluencies: false // Убираем слова-паразиты
        });
        
        if (transcript.status !== 'completed') {
            throw new Error(`AssemblyAI transcription failed with status: ${transcript.status}`);
        }
        
        // Преобразуем формат AssemblyAI в наш формат Timestamp
        if (!transcript.words || transcript.words.length === 0) {
            // Если нет разбивки по словам, создаем один сегмент со всем текстом
            return [{
                start: 0,
                end: transcript.audio_duration || 0,
                text: transcript.text || ''
            }];
        }
        
        // Создаем сегменты из слов, группируя их по предложениям
        // (примерно каждые 10-15 слов, или по знакам препинания)
        const segments: Timestamp[] = [];
        let currentSegment: Timestamp = {
            start: 0,
            end: 0,
            text: ''
        };
        
        let wordCount = 0;
        let segmentWords: typeof transcript.words = [];
        
        // Группируем слова в сегменты
        for (const word of transcript.words) {
            segmentWords.push(word);
            wordCount++;
            
            // Создаем новый сегмент каждые ~10 слов или на знаках препинания
            const endsWithPunctuation = word.text?.match(/[.!?;]$/);
            
            if (wordCount >= 10 || endsWithPunctuation) {
                if (segmentWords.length > 0) {
                    currentSegment = {
                        start: segmentWords[0].start || 0,
                        end: segmentWords[segmentWords.length - 1].end || 0,
                        text: segmentWords.map(w => w.text).join(' ')
                    };
                    segments.push(currentSegment);
                    segmentWords = [];
                    wordCount = 0;
                }
            }
        }
        
        // Добавляем оставшиеся слова в последний сегмент
        if (segmentWords.length > 0) {
            currentSegment = {
                start: segmentWords[0].start || 0,
                end: segmentWords[segmentWords.length - 1].end || 0,
                text: segmentWords.map(w => w.text).join(' ')
            };
            segments.push(currentSegment);
        }
        
        return segments;
    }
} 