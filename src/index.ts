import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { AIService } from './aiService';
import { VideoProcessor, ProcessOptions } from './videoProcessor';
import { checkFFmpeg, SUPPORTED_VIDEO_FORMATS, MAX_VIDEO_SIZE_MB } from './utils';
import { TranscriptionManager, TranscriptionServiceType } from './transcription';

dotenv.config();

interface ProcessingOptions {
    includeImages: boolean;
    onlyTranscribe: boolean;
}

function parseCommandLineArgs(): ProcessingOptions {
    const args = process.argv.slice(2);
    
    // Parse options from command line
    const options: { [key: string]: boolean  } = {
        onlyTranscribe: true,
        images: false
    };
    args.forEach(arg => {
         if (arg === 'no-images') {
            options.images = false;
        } else if (arg === 'only-transcribe') {
            options.onlyTranscribe = true;
        }
    });
    
    return {// No longer needed, will get from video folder
        includeImages: options.images,
        onlyTranscribe: !!options.onlyTranscribe
    };
}

// New function to get all video files from the video folder
function getVideoFiles(): string[] {
    const videoFolderPath = path.join(process.cwd(), 'video');
    
    // Ensure video folder exists
    if (!fs.existsSync(videoFolderPath)) {
        console.error('\x1b[31m%s\x1b[0m', `Error: Video folder not found: ${videoFolderPath}`);
        console.log('Please create a "video" folder in the project root and add your video files there.');
        process.exit(1);
    }
    
    // Get all files in the video folder
    const files = fs.readdirSync(videoFolderPath);
    
    // Filter for supported video formats
    const videoFiles = files.filter(file => {
        const fileExtension = path.extname(file).toLowerCase();
        return SUPPORTED_VIDEO_FORMATS.includes(fileExtension);
    }).map(file => path.join(videoFolderPath, file));
    
    if (videoFiles.length === 0) {
        console.error('\x1b[31m%s\x1b[0m', 'No supported video files found in the video folder');
        console.log('Supported formats:', SUPPORTED_VIDEO_FORMATS.join(', '));
        process.exit(1);
    }
    
    return videoFiles;
}

async function main() {
    // Check FFmpeg first
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
        process.exit(1);
    }

    // Parse command line arguments
    const options = parseCommandLineArgs();
    const { includeImages, onlyTranscribe } = options;

    // Всегда используем все доступные сервисы транскрипции
    const transcriptionServices = [
        TranscriptionServiceType.GEMINI
    ];

    // Log processing mode
    console.log(`Processing mode: ${includeImages ? 'With image analysis' : 'Audio only (no image analysis)'}`);
    console.log(`Using ALL transcription services: ${transcriptionServices.join(', ')}`);
    if (onlyTranscribe) {
        console.log('Running in TRANSCRIPTION ONLY mode (no AI analysis)');
    }

    // Check if required API keys are set
    let requiredEnvVars: { [key: string]: string | undefined } = {
        'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
        'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
        'GOOGLE_API_KEY': process.env.GOOGLE_API_KEY,
        // Всегда требуем AWS, так как используем Amazon Transcribe
        'AWS_ACCESS_KEY_ID': process.env.AWS_ACCESS_KEY_ID,
        'AWS_SECRET_ACCESS_KEY': process.env.AWS_SECRET_ACCESS_KEY,
        // Добавляем проверку API ключа для AssemblyAI
        'ASSEMBLYAI_API_KEY': process.env.ASSEMBLYAI_API_KEY
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
        console.log('ASSEMBLYAI_API_KEY=your_assemblyai_key_here');
        
        process.exit(1);
    }

    // Get all video files from the video folder
    const videoFiles = getVideoFiles();
    console.log(`Found ${videoFiles.length} video files to process in the ./video folder`);
    
    // Process each video file
    for (let i = 0; i < videoFiles.length; i++) {
        const videoPath = videoFiles[i];
        console.log(`\n===== Processing video ${i + 1} of ${videoFiles.length}: ${path.basename(videoPath)} =====`);
        
        // Check if video file size is within limits
        try {
            const stats = await fs.promises.stat(videoPath);
            const fileSizeInMB = stats.size / (1024 * 1024);
            
            if (fileSizeInMB > MAX_VIDEO_SIZE_MB) {
                console.warn('\x1b[33m%s\x1b[0m', `Warning: Video file is large (${Math.round(fileSizeInMB)}MB). Maximum recommended size is ${MAX_VIDEO_SIZE_MB}MB`);
                console.log('Processing anyway, but this might take longer...');
            }
        } catch (error: any) {
            console.error('\x1b[31m%s\x1b[0m', `Error checking video file size: ${error.message}`);
            console.log('Skipping this video and continuing with others...');
            continue;
        }

        try {
            // Initialize services for this video
            const processorOptions: ProcessOptions = { videoPath, includeImages };
            const videoProcessor = new VideoProcessor(processorOptions);
            const aiService = new AIService();
            
            // Process the video with all transcription services
            await processMatrix(videoProcessor, aiService, transcriptionServices, onlyTranscribe);
            
            console.log(`\n✅ Completed processing ${path.basename(videoPath)}`);
        } catch (error) {
            console.error('\x1b[31m%s\x1b[0m', `Error during processing ${path.basename(videoPath)}:`);
            if (error instanceof Error) {
                console.error(error.message);
                if (error.stack) {
                    console.error('\nStack trace:');
                    console.error(error.stack);
                }
            } else {
                console.error(error);
            }
            console.log('Continuing with next video...');
        }
    }
    
    console.log('\n===== All videos have been processed =====');
}

// Новая функция для генерации матрицы результатов
async function processMatrix(
    videoProcessor: VideoProcessor, 
    aiService: AIService,
    transcriptionServices: TranscriptionServiceType[],
    onlyTranscribe: boolean = false,
    includeImages: boolean = false
) {
    console.log('Processing video...');
    console.log(`Output directory: ${videoProcessor.getOutputDirectory()}`);

    // Получаем путь к видео из videoProcessor
    const videoPath = videoProcessor.getVideoPath(); // Используем геттер

    // Step 1: Extract audio
    console.log('Extracting audio...');
    const audioPath = await videoProcessor.extractAudio();

    if(includeImages){
        return;
    }
    // Step 2: Extract frames if needed
    console.log('Extracting frames...');
    const frames = await videoProcessor.extractFrames();
    
    // Prepare to store all transcriptions
    const transcriptions: { [service: string]: any } = {};
    
    // Step 3: Create transcriptions with each service
    for (const service of transcriptionServices) {
        console.log(`\n===== Transcribing with ${service} =====`);
        try {
            const timestamps = await TranscriptionManager.transcribe(audioPath, service);
            transcriptions[service] = timestamps;
            
            // Save structured JSON transcription
            await videoProcessor.saveTranscription(timestamps, service);
            
            // Save raw text version of the transcription
            await videoProcessor.saveRawTranscriptionText(timestamps, service);
            
        } catch (error) {
            console.error(`Error with ${service} transcription:`, error);
            console.log(`Skipping ${service} transcription and continuing with others...`);
        }
    }
    
    // Если ни один сервис транскрипции не удался, завершаем работу
    if (Object.keys(transcriptions).length === 0) {
        throw new Error('All transcription services failed. Cannot continue.');
    }
    
    // Step 4: For each transcription, run all AI analysis (skip if onlyTranscribe is true)
    if (!onlyTranscribe) {
        const includeImages = videoProcessor.getIncludeImages();
        
        for (const [service, timestamps] of Object.entries(transcriptions)) {
            const serviceShortName = service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : service === TranscriptionServiceType.AMAZON_TRANSCRIBE ? 'amazon' : 'assemblyai';
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
    } else {
        console.log('\nSkipping AI analysis (running in transcription-only mode)');
    }
    
    console.log('\nProcessing completed successfully!');
    console.log(`All files are saved in: ${videoProcessor.getOutputDirectory()}`);
    
    // Сводка результатов
    console.log('\n===== Results Summary =====');
    console.log(`Total transcription services used: ${Object.keys(transcriptions).length}`);
    
    // Получаем значение includeImages снова, так как оно может быть не видно в этом блоке
    const includeImagesInSummary = videoProcessor.getIncludeImages();
    
    if (!onlyTranscribe) {
        for (const service of Object.keys(transcriptions)) {
            const serviceShortName = service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : service === TranscriptionServiceType.AMAZON_TRANSCRIBE ? 'amazon' : 'assemblyai';
            console.log(`\nTranscription by ${serviceShortName}:`);
            console.log(`- OpenAI analysis: analysis_openai_transcribed_by_${serviceShortName}${includeImagesInSummary ? '_with_images' : ''}.json`);
            console.log(`- Anthropic analysis: analysis_anthropic_transcribed_by_${serviceShortName}${includeImagesInSummary ? '_with_images' : ''}.json`);
            console.log(`- Gemini analysis: analysis_gemini_transcribed_by_${serviceShortName}${includeImagesInSummary ? '_with_images' : ''}.json`);
        }
    } else {
        // В режиме только транскрипции показываем только файлы транскрипций
        console.log('\nTranscription files created:');
        for (const service of Object.keys(transcriptions)) {
            const serviceShortName = service === TranscriptionServiceType.OPENAI_WHISPER ? 'openai' : service === TranscriptionServiceType.AMAZON_TRANSCRIBE ? 'amazon' : 'assemblyai';
            console.log(`- transcription_${serviceShortName}.json`);
            console.log(`- transcription_${serviceShortName}_raw.txt`);
        }
    }
}

// Run the application 
main().catch(console.error);