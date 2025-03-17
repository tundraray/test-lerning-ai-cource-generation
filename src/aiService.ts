import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import { Timestamp, retry, imageToBase64 } from './utils';
import dotenv from 'dotenv';

dotenv.config();

// AI model constants
export const OPENAI_MODEL = "gpt-4o-2024-11-20";
export const ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620";
export const GEMINI_MODEL = "gemini-2.0-flash";

// Initialize AI clients
export const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || ''
});

export const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// System prompt
export const LESSON_SYSTEM_PROMPT = `You need to create a lesson from the content that the user sends you.
The lesson must be generated in the SAME LANGUAGE as the transcription content (do not translate, use the original language).
The lesson should contain the following:
1) 2-7 memory cards (each description must be between 40 to 150 characters)
2) 1-3 quiz cards with varied questions
3) 1 Open-Ended Question Card
4) The lesson must have a title and description, which you must fill out in lessonInfo section and must reflect the overall essence of our lesson

Your answer must be structured exactly in JSON format. Do not include any additional text or formatting.`;

export class AIService {
    // Analyze with OpenAI
    async analyzeWithOpenAI(timestamps: Timestamp[], frames: string[], includeImages: boolean): Promise<string> {
        return retry(async () => {
            const messages = [
                { role: "system", content: LESSON_SYSTEM_PROMPT },
                { 
                    role: "user", 
                    content: includeImages ? [
                        {
                            type: "text",
                            text: `Create a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
                        },
                        ...await Promise.all(frames.map(async (frame) => ({
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${await imageToBase64(frame)}`
                            }
                        })))
                    ] : `Create a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
                }
            ];

            const completion = await openai.chat.completions.create({
                model: OPENAI_MODEL,
                messages: messages as any,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            });

            return completion.choices[0].message.content || '';
        });
    }

    // Analyze with Anthropic Claude
    async analyzeWithAnthropic(timestamps: Timestamp[], frames: string[], includeImages: boolean): Promise<string> {
        return retry(async () => {
            const imageContents = includeImages ? await Promise.all(frames.map(async (frame) => ({
                type: "image" as const,
                source: {
                    type: "base64" as const,
                    media_type: "image/jpeg" as const,
                    data: await imageToBase64(frame)
                }
            }))) : [];

            const message = await anthropic.messages.create({
                model: ANTHROPIC_MODEL,
                max_tokens: 1000,
                messages: [{
                    role: "user",
                    content: includeImages ? [
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

    // Analyze with Google Gemini
    async analyzeWithGemini(timestamps: Timestamp[], frames: string[], includeImages: boolean): Promise<string> {
        return retry(async () => {
            const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
            
            const imageContents = includeImages ? await Promise.all(frames.map(async frame => ({
                inlineData: {
                    data: (await fs.promises.readFile(frame)).toString('base64'),
                    mimeType: 'image/jpeg'
                }
            }))) : [];

            const content = includeImages ? [
                `${LESSON_SYSTEM_PROMPT}\n\nCreate a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`,
                ...imageContents
            ] : [
                `${LESSON_SYSTEM_PROMPT}\n\nCreate a lesson based on this video content:\nTranscription: ${JSON.stringify(timestamps)}`
            ];

            const result = await model.generateContent(content);
            return result.response.text();
        });
    }
} 