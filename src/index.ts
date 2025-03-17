import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { AIService } from './aiService';
import { VideoProcessor, ProcessOptions } from './videoProcessor';
import { checkFFmpeg, SUPPORTED_VIDEO_FORMATS, MAX_VIDEO_SIZE_MB } from './utils';
import { TranscriptionService, TranscriptionServiceType } from './transcriptionService';

dotenv.config();

interface ProcessingOptions {
    videoPath: string;
    includeImages: boolean;
}

function parseCommandLineArgs(): ProcessingOptions {
    const args = process.argv.slice(2);
    const videoPath = args[0];
    
    // Parse options from command line
    const options: { [key: string]: string } = {};
    args.slice(1).forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            options[key] = value || 'true';
        } else if (arg === 'no-images') {
            options.images = 'false';
        }
    });
    
    return {
        videoPath,
        includeImages: options.images !== 'false'
    };
}

async function main() {
    // Check FFmpeg first
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
        process.exit(1);
    }

    // Parse command line arguments
    const options = parseCommandLineArgs();
    const { videoPath, includeImages } = options;

    // Всегда используем все доступные сервисы транскрипции
    const transcriptionServices = [
        TranscriptionServiceType.OPENAI_WHISPER,
        TranscriptionServiceType.AMAZON_TRANSCRIBE
    ];

    // Log processing mode
    console.log(`Processing mode: ${includeImages ? 'With image analysis' : 'Audio only (no image analysis)'}`);
    console.log(`Using ALL transcription services: ${transcriptionServices.join(', ')}`);

    if (!videoPath) {
        console.error('\x1b[31m%s\x1b[0m', 'Please provide a video path as an argument');
        console.log('Usage: npm start <video_path> [no-images]');
        process.exit(1);
    }

    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
        console.error('\x1b[31m%s\x1b[0m', `Error: Video file not found: ${videoPath}`);
        process.exit(1);
    }

    // Validate video format
    const fileExtension = path.extname(videoPath).toLowerCase();
    if (!SUPPORTED_VIDEO_FORMATS.includes(fileExtension)) {
        console.error('\x1b[31m%s\x1b[0m', `Error: Unsupported video format: ${fileExtension}`);
        console.log('Supported formats:', SUPPORTED_VIDEO_FORMATS.join(', '));
        process.exit(1);
    }

    // Check video file size
    try {
        const stats = await fs.promises.stat(videoPath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        
        if (fileSizeInMB > MAX_VIDEO_SIZE_MB) {
            console.error('\x1b[31m%s\x1b[0m', `Error: Video file is too large (${Math.round(fileSizeInMB)}MB). Maximum size is ${MAX_VIDEO_SIZE_MB}MB`);
            process.exit(1);
        }
    } catch (error: any) {
        console.error('\x1b[31m%s\x1b[0m', `Error checking video file size: ${error.message}`);
        process.exit(1);
    }

    // Check if required API keys are set
    let requiredEnvVars: { [key: string]: string | undefined } = {
        'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
        'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
        'GOOGLE_API_KEY': process.env.GOOGLE_API_KEY,
        // Всегда требуем AWS, так как используем Amazon Transcribe
        'AWS_ACCESS_KEY_ID': process.env.AWS_ACCESS_KEY_ID,
        'AWS_SECRET_ACCESS_KEY': process.env.AWS_SECRET_ACCESS_KEY,
    };

    const missingEnvVars = Object.entries(requiredEnvVars)
        .filter(([key, value]) => {
            // AWS_REGION is optional with default
            if (key === 'AWS_REGION') return false;
            return !value;
        })
        .map(([key]) => key);

    if (missingEnvVars.length > 0) {
        console.error('\x1b[31m%s\x1b[0m', 'Error: Missing required environment variables:');
        console.error(missingEnvVars.join(', '));
        console.log('\nPlease create a .env file with the following variables:');
        console.log('OPENAI_API_KEY=your_openai_key_here');
        console.log('ANTHROPIC_API_KEY=your_anthropic_key_here');
        console.log('GOOGLE_API_KEY=your_google_key_here');
        console.log('AWS_ACCESS_KEY_ID=your_aws_access_key_here');
        console.log('AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here');
        console.log('AWS_REGION=us-east-1 (optional)');
        console.log('AWS_S3_BUCKET=your_bucket_name (optional)');
        
        process.exit(1);
    }

    try {
        // Initialize services
        const processorOptions: ProcessOptions = { videoPath, includeImages };
        const videoProcessor = new VideoProcessor(processorOptions);
        const aiService = new AIService();
        
        // Process the video with all transcription services
        await processMatrix(videoProcessor, aiService, transcriptionServices);
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'Error during processing:');
        if (error instanceof Error) {
            console.error(error.message);
            if (error.stack) {
                console.error('\nStack trace:');
                console.error(error.stack);
            }
        } else {
            console.error(error);
        }
        process.exit(1);
    }
}

// Новая функция для генерации матрицы результатов
async function processMatrix(
    videoProcessor: VideoProcessor, 
    aiService: AIService,
    transcriptionServices: TranscriptionServiceType[]
) {
    console.log('Processing video...');
    console.log(`Output directory: ${videoProcessor.getOutputDirectory()}`);

    // Получаем путь к видео из videoProcessor
    const videoPath = videoProcessor.getVideoPath(); // Используем геттер

    // Step 1: Extract audio
    console.log('Extracting audio...');
    const audioPath = await videoProcessor.extractAudio();

    // Step 2: Extract frames if needed
    console.log('Extracting frames...');
    const frames = await videoProcessor.extractFrames();
    
    // Prepare to store all transcriptions
    const transcriptions: { [service: string]: any } = {};
    
    // Step 3: Create transcriptions with each service
    for (const service of transcriptionServices) {
        console.log(`\n===== Transcribing with ${service} =====`);
        try {
            const timestamps = await TranscriptionService.transcribe(audioPath, service);
            transcriptions[service] = timestamps;
            
            // Save individual transcription
            const serviceName = service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : 'amazon';
            await videoProcessor.saveTranscription(timestamps, serviceName);
            
        } catch (error) {
            console.error(`Error with ${service} transcription:`, error);
            console.log(`Skipping ${service} transcription and continuing with others...`);
        }
    }
    
    // Если ни один сервис транскрипции не удался, завершаем работу
    if (Object.keys(transcriptions).length === 0) {
        throw new Error('All transcription services failed. Cannot continue.');
    }
    
    // Сохраняем все транскрипции в один файл для сравнения
    try {
        const allTranscriptions: {
            timestamp: string;
            videoName: string;
            services: string[];
            transcriptions: Record<string, any>;
        } = {
            timestamp: new Date().toISOString(),
            videoName: path.basename(videoPath, path.extname(videoPath)),
            services: Object.keys(transcriptions).map(service => 
                service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : 'amazon'
            ),
            transcriptions: {}
        };
        
        for (const [service, timestamps] of Object.entries(transcriptions)) {
            const serviceName = service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : 'amazon';
            allTranscriptions.transcriptions[serviceName] = timestamps;
        }
        
        const allTranscriptionsPath = path.join(videoProcessor.getOutputDirectory(), 'all_transcriptions.json');
        console.log('\n📄 Creating combined transcriptions file with all services...');
        await fs.promises.writeFile(allTranscriptionsPath, JSON.stringify(allTranscriptions, null, 2), 'utf-8');
        console.log(`✅ All transcriptions saved to ${allTranscriptionsPath}`);
        console.log(`   File contains data from ${Object.keys(transcriptions).length} transcription services.`);
    } catch (error) {
        console.error('❌ Error saving combined transcriptions:', error);
    }
    
    // Step 4: For each transcription, run all AI analysis
    const includeImages = videoProcessor.getIncludeImages();
    
    for (const [service, timestamps] of Object.entries(transcriptions)) {
        const serviceShortName = service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : 'amazon';
        console.log(`\n===== Processing transcription from ${serviceShortName} =====`);
        
        // OpenAI Analysis
        console.log('Analyzing with OpenAI...');
        try {
            const openaiAnalysis = await aiService.analyzeWithOpenAI(timestamps, frames, includeImages);
            await videoProcessor.saveAnalysis(openaiAnalysis, `openai_transcribed_by_${serviceShortName}`);
        } catch (error) {
            console.error(`Error with OpenAI analysis (${serviceShortName} transcription):`, error);
        }
        
        // Anthropic Analysis
        console.log('Analyzing with Anthropic Claude...');
        try {
            const anthropicAnalysis = await aiService.analyzeWithAnthropic(timestamps, frames, includeImages);
            await videoProcessor.saveAnalysis(anthropicAnalysis, `anthropic_transcribed_by_${serviceShortName}`);
        } catch (error) {
            console.error(`Error with Anthropic analysis (${serviceShortName} transcription):`, error);
        }
        
        // Gemini Analysis
        console.log('Analyzing with Google Gemini...');
        try {
            const geminiAnalysis = await aiService.analyzeWithGemini(timestamps, frames, includeImages);
            await videoProcessor.saveAnalysis(geminiAnalysis, `gemini_transcribed_by_${serviceShortName}`);
        } catch (error) {
            console.error(`Error with Gemini analysis (${serviceShortName} transcription):`, error);
        }
    }
    
    console.log('\nProcessing completed successfully!');
    console.log(`All files are saved in: ${videoProcessor.getOutputDirectory()}`);
    
    // Сводка результатов
    console.log('\n===== Results Summary =====');
    console.log(`Total transcription services used: ${Object.keys(transcriptions).length}`);
    for (const service of Object.keys(transcriptions)) {
        const serviceShortName = service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : 'amazon';
        console.log(`\nTranscription by ${serviceShortName}:`);
        console.log(`- OpenAI analysis: analysis_openai_transcribed_by_${serviceShortName}${includeImages ? '_with_images' : ''}.json`);
        console.log(`- Anthropic analysis: analysis_anthropic_transcribed_by_${serviceShortName}${includeImages ? '_with_images' : ''}.json`);
        console.log(`- Gemini analysis: analysis_gemini_transcribed_by_${serviceShortName}${includeImages ? '_with_images' : ''}.json`);
    }
}

// Run the application
main().catch(console.error); 