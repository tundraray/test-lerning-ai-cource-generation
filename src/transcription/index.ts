import { Timestamp } from '../utils';
import { OpenAIWhisperService } from './openaiWhisper';
import { AmazonTranscribeService } from './amazonTranscribe';
import { AssemblyAIService } from './assemblyAI';
import { GeminiTranscriptionService } from './gemini';
import { TranscriptionService, TranscriptionServiceType } from './types';

// Создаем экземпляры сервисов
const openaiWhisperService = new OpenAIWhisperService();
const amazonTranscribeService = new AmazonTranscribeService();
const assemblyAIService = new AssemblyAIService();
const geminiTranscriptionService = new GeminiTranscriptionService();

// Фасад для всех сервисов транскрипции
export class TranscriptionManager {
    /**
     * Транскрибирует аудио с использованием указанного сервиса
     * @param audioPath Путь к аудио файлу
     * @param service Сервис транскрипции
     * @returns Promise<Timestamp[]> Массив временных меток с текстом
     */
    static async transcribe(
        audioPath: string,
        service: TranscriptionServiceType = TranscriptionServiceType.OPENAI_WHISPER
    ): Promise<Timestamp[]> {
        switch (service) {
            case TranscriptionServiceType.AMAZON_TRANSCRIBE:
                return amazonTranscribeService.transcribe(audioPath);
            case TranscriptionServiceType.ASSEMBLY_AI:
                return assemblyAIService.transcribe(audioPath);
            case TranscriptionServiceType.GEMINI:
                return geminiTranscriptionService.transcribe(audioPath);
            case TranscriptionServiceType.OPENAI_WHISPER:
            default:
                return openaiWhisperService.transcribe(audioPath);
        }
    }
}

// Экспортируем все для обратной совместимости
export { TranscriptionServiceType, TranscriptionService } from './types';
export { OpenAIWhisperService } from './openaiWhisper';
export { AmazonTranscribeService } from './amazonTranscribe';
export { AssemblyAIService } from './assemblyAI';
export { GeminiTranscriptionService } from './gemini'; 