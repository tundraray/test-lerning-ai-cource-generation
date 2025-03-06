import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import sharp from 'sharp';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

dotenv.config();

interface ProcessOptions {
    videoPath: string;
    includeImages: boolean;
}

// Check if FFmpeg is installed and accessible
async function checkFFmpeg(): Promise<boolean> {
    try {
        await execAsync('ffmpeg -version');
        return true;
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', 'FFmpeg is not installed or not accessible in PATH!');
        console.log('\nTo install FFmpeg:');
        console.log('\nWindows (PowerShell as Administrator):');
        console.log('powershell -ExecutionPolicy Bypass -File install-ffmpeg-windows.ps1');
        console.log('\nLinux:');
        console.log('sudo bash install-ffmpeg-linux.sh');
        console.log('\nOr install manually from:');
        console.log('Windows: https://ffmpeg.org/download.html');
        console.log('Mac: brew install ffmpeg');
        console.log('Linux: sudo apt-get install ffmpeg');
        return false;
    }
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || ''
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

interface Timestamp {
    start: number;
    end: number;
    text: string;
}

async function retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: Error;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            if (i < maxRetries - 1) {
                console.log(`Retry ${i + 1}/${maxRetries} - Waiting ${delayMs}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    throw lastError!;
}

// Add after imports
const LESSON_SYSTEM_PROMPT = `You need to create a lesson from the content that the user sends you.
The lesson must be generated in the SAME LANGUAGE as the transcription content (do not translate, use the original language).
The lesson should contain the following:
1) 2-7 memory cards (each description must be between 40 to 150 characters)
2) 1-3 quiz cards with varied questions
3) 1 Open-Ended Question Card
4) The lesson must have a title and description, which you must fill out in lessonInfo section and must reflect the overall essence of our lesson

Your answer must be structured exactly in JSON format. Do not include any additional text or formatting.`;

const openai_model = "gpt-4o-2024-11-20";
const anthropic_model = "claude-3-5-sonnet-20240620";
const gemini_model = "gemini-2.0-flash";

class VideoProcessor {
    private videoPath: string;
    private outputDir: string;
    private videoName: string;
    private videoOutputDir: string;
    private includeImages: boolean;

    constructor(options: ProcessOptions) {
        this.videoPath = options.videoPath;
        this.includeImages = options.includeImages;
        this.videoName = path.basename(options.videoPath, path.extname(options.videoPath));
        this.outputDir = path.join(process.cwd(), 'output');
        this.videoOutputDir = path.join(this.outputDir, this.videoName);

        // Create or recreate output directories
        console.log('Setting up output directories...');
        
        // Create main output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            console.log(`Creating main output directory: ${this.outputDir}`);
            fs.mkdirSync(this.outputDir);
        }

        // Remove existing video output directory if it exists with retries
        // this.removeExistingOutputDirectory(this.videoOutputDir);

        // Create video output directory if it doesn't exist
        if (!fs.existsSync(this.videoOutputDir)) {
            console.log(`Creating video output directory: ${this.videoOutputDir}`);
            try {
                fs.mkdirSync(this.videoOutputDir);
            } catch (error: any) {
                throw new Error(`Failed to create output directory: ${error.message}`);
            }
        }
    }

    private removeExistingOutputDirectory(dir: string) {
        if (fs.existsSync(dir)) {
            console.log(`Removing existing output directory: ${dir}`);
            const maxRetries = 3;
            const retryDelay = 1000; // 1 second

            for (let i = 0; i < maxRetries; i++) {
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                    break; // If successful, exit the loop
                } catch (error) {
                    if (i === maxRetries - 1) {
                        // On last retry, try to handle gracefully
                        console.warn(`Warning: Could not remove directory ${dir} after ${maxRetries} attempts.`);
                        console.warn('Will attempt to continue with existing directory...');
                        
                        // Try to clean up contents instead of removing directory
                        try {
                                const files = fs.readdirSync(dir);
                            for (const file of files) {
                                const filePath = path.join(dir, file);
                                try {
                                    if (fs.lstatSync(filePath).isDirectory()) {
                                        fs.rmSync(filePath, { recursive: true, force: true });
                                    } else {
                                        fs.unlinkSync(filePath);
                                    }
                                } catch (e) {
                                    console.warn(`Could not remove ${filePath}`);
                                }
                            }
                        } catch (e) {
                            console.warn('Could not clean directory contents');
                        }
                    } else {
                        console.log(`Retry ${i + 1}/${maxRetries} - Waiting ${retryDelay}ms before next attempt...`);
                        // Sleep for retryDelay milliseconds
                        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelay);
                    }
                }
            }
        }
    }

    private extractAudio(): Promise<string> {
        const audioPath = path.join(this.videoOutputDir, 'audio.mp3');
        return new Promise((resolve, reject) => {
            ffmpeg(this.videoPath)
                .toFormat('mp3')
                .on('end', () => resolve(audioPath))
                .on('error', (err: Error) => reject(err))
                .save(audioPath);
        });
    }

    private extractFrames(): Promise<string[]> {
        if (!this.includeImages) {
            return Promise.resolve([]);
        }

        const framesDir = path.join(this.videoOutputDir, 'frames');
        if (!fs.existsSync(framesDir)) {
            fs.mkdirSync(framesDir);
        }

        return new Promise((resolve, reject) => {
            const frames: string[] = [];
            
            // First, get video metadata
            ffmpeg.ffprobe(this.videoPath, (err, metadata) => {
                if (err) {
                    reject(err);
                    return;
                }

                const duration = metadata.format.duration || 0;
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                
                if (!videoStream) {
                    reject(new Error('No video stream found'));
                    return;
                }

                // Get video dimensions
                const width = videoStream.width || 1280;
                const height = videoStream.height || 720;

                // Calculate dimensions maintaining aspect ratio with max width/height of 1280
                let targetWidth = width;
                let targetHeight = height;
                const maxDimension = 1280;

                if (width > height && width > maxDimension) {
                    targetWidth = maxDimension;
                    targetHeight = Math.round((height * maxDimension) / width);
                } else if (height > maxDimension) {
                    targetHeight = maxDimension;
                    targetWidth = Math.round((width * maxDimension) / height);
                }

                console.log(`Video dimensions: ${width}x${height}`);
                console.log(`Frame dimensions: ${targetWidth}x${targetHeight}`);

                ffmpeg(this.videoPath)
                    .on('end', () => resolve(frames))
                    .on('error', (err: Error) => reject(err))
                    .on('filenames', (filenames: string[]) => {
                        frames.push(...filenames.map(filename => path.join(framesDir, filename)));
                    })
                    .screenshots({
                        count: Math.ceil(duration),
                        timemarks: Array.from({ length: Math.ceil(duration) }, (_, i) => i), // [0, 1, 2, ...]
                        folder: framesDir,
                        filename: 'frame-%i.jpg',
                        size: `${targetWidth}x${targetHeight}`
                    });
            });
        });
    }

    private async transcribeAudio(audioPath: string): Promise<Timestamp[]> {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            prompt: "Please translate all 'text', 'title', and 'description' elements of this json to %s language and return exactly the same json in response but with translated 'text', 'title', and 'description' elements. Do not translate the values inside the object \"statusInfo\": {}. Make sure that the response is **only** the JSON structure above and does not include any additional formatting like '```json' or other textual explanations.",
            model: "whisper-1",
            response_format: "verbose_json"
        });

        return (transcription.segments || []).map(segment => ({
            start: segment.start,
            end: segment.end,
            text: segment.text
        }));
    }

    private async imageToBase64(imagePath: string): Promise<string> {
        const imageBuffer = await fs.promises.readFile(imagePath);
        return imageBuffer.toString('base64');
    }

    private async analyzeWithOpenAI(timestamps: Timestamp[], frames: string[]): Promise<string> {
        return retry(async () => {
            const messages = [
                { role: "system", content: LESSON_SYSTEM_PROMPT },
                { 
                    role: "user", 
                    content: this.includeImages ? [
                        {
                            type: "text",
                            text: `Create a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
                        },
                        ...await Promise.all(frames.map(async (frame) => ({
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${await this.imageToBase64(frame)}`
                            }
                        })))
                    ] : `Create a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
                }
            ];

            const completion = await openai.chat.completions.create({
                model: openai_model,
                messages: messages as any,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            });

            return completion.choices[0].message.content || '';
        });
    }

    private async analyzeWithAnthropic(timestamps: Timestamp[], frames: string[]): Promise<string> {
        return retry(async () => {
            const imageContents = this.includeImages ? await Promise.all(frames.map(async (frame) => ({
                type: "image" as const,
                source: {
                    type: "base64" as const,
                    media_type: "image/jpeg" as const,
                    data: await this.imageToBase64(frame)
                }
            }))) : [];

            const message = await anthropic.messages.create({
                model: anthropic_model,
                max_tokens: 1000,
                messages: [{
                    role: "user",
                    content: this.includeImages ? [
                        {
                            type: "text" as const,
                            text: `${LESSON_SYSTEM_PROMPT}\n\nCreate a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
                        },
                        ...imageContents
                    ] : `${LESSON_SYSTEM_PROMPT}\n\nCreate a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
                }]
            });

            const content = message.content[0];
            if (content.type === 'text') {
                return content.text;
            }
            return 'No text content received from Claude';
        });
    }

    private async analyzeWithGemini(timestamps: Timestamp[], frames: string[]): Promise<string> {
        return retry(async () => {
            const model = genAI.getGenerativeModel({ model: gemini_model });
            
            const imageContents = this.includeImages ? await Promise.all(frames.map(async frame => ({
                inlineData: {
                    data: (await fs.promises.readFile(frame)).toString('base64'),
                    mimeType: 'image/jpeg'
                }
            }))) : [];

            const content = this.includeImages ? [
                `${LESSON_SYSTEM_PROMPT}\n\nCreate a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`,
                ...imageContents
            ] : [
                `${LESSON_SYSTEM_PROMPT}\n\nCreate a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
            ];

            const result = await model.generateContent(content);
            return result.response.text();
        });
    }

    private async saveTranscription(timestamps: Timestamp[]): Promise<void> {
        const transcriptionPath = path.join(this.videoOutputDir, 'transcription.json');
        await fs.promises.writeFile(transcriptionPath, JSON.stringify(timestamps, null, 2), 'utf-8');
        console.log(`Transcription saved to ${transcriptionPath}`);
    }

    private async saveAnalysis(content: string, aiName: string): Promise<void> {
        const filename = path.join(this.videoOutputDir, `analysis_${aiName}${this.includeImages ? '_with_images' : ''}.json`);
        await fs.promises.writeFile(filename, content, 'utf-8');
        console.log(`Analysis saved to ${filename}`);
    }

    public async process(): Promise<void> {
        try {
            console.log(`Processing video: ${this.videoName}`);
            console.log(`Output directory: ${this.videoOutputDir}`);

            console.log('Extracting audio...');
            const audioPath = await this.extractAudio();

            console.log('Extracting frames...');
            const frames = await this.extractFrames();

            console.log('Transcribing audio...');
            const timestamps = await this.transcribeAudio(audioPath);
            await this.saveTranscription(timestamps);

            console.log('Analyzing with OpenAI...');
            const openaiAnalysis = await this.analyzeWithOpenAI(timestamps, frames);
            await this.saveAnalysis(openaiAnalysis, 'openai');

            console.log('Analyzing with Anthropic Claude...');
            const anthropicAnalysis = await this.analyzeWithAnthropic(timestamps, frames);
            await this.saveAnalysis(anthropicAnalysis, 'anthropic');

            console.log('Analyzing with Google Gemini...');
            const geminiAnalysis = await this.analyzeWithGemini(timestamps, frames);
            await this.saveAnalysis(geminiAnalysis, 'gemini');

            console.log('Processing completed successfully!');
            console.log(`All files are saved in: ${this.videoOutputDir}`);
        } catch (error) {
            console.error('Error during processing:', error);
            throw error;
        }
    }
}

async function main() {
    // Check FFmpeg first
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
        process.exit(1);
    }

    // Parse command line arguments
    const args = process.argv.slice(2);
    const videoPath = args[0];
    const includeImages = args[1] !== 'no-images';

    // Log processing mode
    console.log(`Processing mode: ${includeImages ? 'With image analysis' : 'Audio only (no image analysis)'}`);

    if (!videoPath) {
        console.error('\x1b[31m%s\x1b[0m', 'Please provide a video path as an argument');
        console.log('Usage: npm start <video_path> [--no-images]');
        process.exit(1);
    }

    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
        console.error('\x1b[31m%s\x1b[0m', `Error: Video file not found: ${videoPath}`);
        process.exit(1);
    }

    // Validate video format
    const supportedFormats = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    const fileExtension = path.extname(videoPath).toLowerCase();
    if (!supportedFormats.includes(fileExtension)) {
        console.error('\x1b[31m%s\x1b[0m', `Error: Unsupported video format: ${fileExtension}`);
        console.log('Supported formats:', supportedFormats.join(', '));
        process.exit(1);
    }

    // Check video file size
    try {
        const stats = await fs.promises.stat(videoPath);
        const fileSizeInMB = stats.size / (1024 * 1024);
        const maxSizeInMB = 500; // 500MB limit
        
        if (fileSizeInMB > maxSizeInMB) {
            console.error('\x1b[31m%s\x1b[0m', `Error: Video file is too large (${Math.round(fileSizeInMB)}MB). Maximum size is ${maxSizeInMB}MB`);
            process.exit(1);
        }
    } catch (error: any) {
        console.error('\x1b[31m%s\x1b[0m', `Error checking video file size: ${error.message}`);
        process.exit(1);
    }

    // Check if API keys are set
    const requiredEnvVars = {
        'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
        'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
        'GOOGLE_API_KEY': process.env.GOOGLE_API_KEY
    };

    const missingEnvVars = Object.entries(requiredEnvVars)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missingEnvVars.length > 0) {
        console.error('\x1b[31m%s\x1b[0m', 'Error: Missing required environment variables:');
        console.error(missingEnvVars.join(', '));
        console.log('\nPlease create a .env file with the following variables:');
        console.log('OPENAI_API_KEY=your_openai_key_here');
        console.log('ANTHROPIC_API_KEY=your_anthropic_key_here');
        console.log('GOOGLE_API_KEY=your_google_key_here');
        process.exit(1);
    }

    try {
        const processor = new VideoProcessor({ videoPath, includeImages });
        await processor.process();
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

main().catch(console.error); 