import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

export const execAsync = promisify(exec);

export interface Timestamp {
    start: number;
    end: number;
    text: string;
}

export async function retry<T>(
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

export async function checkFFmpeg(): Promise<boolean> {
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

export function removeExistingDirectory(dir: string): void {
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

export async function imageToBase64(imagePath: string): Promise<string> {
    const imageBuffer = await fs.promises.readFile(imagePath);
    return imageBuffer.toString('base64');
}

export const SUPPORTED_VIDEO_FORMATS = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
export const MAX_VIDEO_SIZE_MB = 500; // 500MB 