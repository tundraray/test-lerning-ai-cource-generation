import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import { Timestamp, removeExistingDirectory } from './utils';

export interface ProcessOptions {
    videoPath: string;
    includeImages: boolean;
}

export class VideoProcessor {
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

        this.setupDirectories();
    }

    private setupDirectories(): void {
        // Create or recreate output directories
        console.log('Setting up output directories...');
        
        // Create main output directory if it doesn't exist
        if (!fs.existsSync(this.outputDir)) {
            console.log(`Creating main output directory: ${this.outputDir}`);
            fs.mkdirSync(this.outputDir);
        }

        // Remove existing video output directory if it exists
        removeExistingDirectory(this.videoOutputDir);

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

    public extractAudio(): Promise<string> {
        const audioPath = path.join(this.videoOutputDir, 'audio.mp3');
        return new Promise((resolve, reject) => {
            ffmpeg(this.videoPath)
                .toFormat('mp3')
                .on('end', () => resolve(audioPath))
                .on('error', (err: Error) => reject(err))
                .save(audioPath);
        });
    }

    public extractFrames(): Promise<string[]> {
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

    public async saveTranscription(timestamps: Timestamp[], serviceName?: string): Promise<void> {
        const filename = serviceName 
            ? `transcription_${serviceName}.json` 
            : 'transcription.json';
        const transcriptionPath = path.join(this.videoOutputDir, filename);
        
        console.log(`Saving transcription from ${serviceName || 'default'} service...`);
        await fs.promises.writeFile(transcriptionPath, JSON.stringify(timestamps, null, 2), 'utf-8');
        console.log(`✅ Transcription successfully saved to ${transcriptionPath}`);
        console.log(`   File contains ${timestamps.length} segments.`);
    }

    public async saveAnalysis(content: string, aiName: string): Promise<void> {
        const filename = path.join(this.videoOutputDir, `analysis_${aiName}${this.includeImages ? '_with_images' : ''}.json`);
        await fs.promises.writeFile(filename, content, 'utf-8');
        console.log(`Analysis saved to ${filename}`);
    }

    public getOutputDirectory(): string {
        return this.videoOutputDir;
    }

    public getIncludeImages(): boolean {
        return this.includeImages;
    }

    public getVideoPath(): string {
        return this.videoPath;
    }
} 