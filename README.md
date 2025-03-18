# Video Processing Application

This application processes video files by:
1. Extracting audio
2. Capturing frames at 1 FPS (one frame per second) with preserved aspect ratio
3. Transcribing audio using FOUR transcription services:
   - OpenAI Whisper
   - Amazon Transcribe
   - AssemblyAI
   - Google Gemini
4. Analyzing content using multiple AI models:
   - OpenAI GPT-4 with Vision
   - Anthropic Claude 3
   - Google Gemini

## Prerequisites

- Node.js (v16 or higher)
- FFmpeg
- API keys for:
  - OpenAI (with GPT-4 access)
  - Anthropic
  - Google AI
  - Amazon Web Services
  - AssemblyAI

## FFmpeg Installation

### Windows
You have two options for installation:

1. As Administrator (recommended):
```powershell
# Run PowerShell as Administrator
powershell -ExecutionPolicy Bypass -File install-ffmpeg-windows.ps1
```
This will install FFmpeg to `C:\Program Files\FFmpeg` and add it to system PATH.

2. As Regular User:
```powershell
# Run in regular PowerShell
powershell -ExecutionPolicy Bypass -File install-ffmpeg-windows.ps1
```
This will install FFmpeg to `%USERPROFILE%\FFmpeg` and add it to user PATH.

After installation, you have three ways to update PATH:
1. Restart PowerShell
2. Run the command: `Update-PathEnv`
3. Restart your computer

The `Update-PathEnv` function is automatically added to your PowerShell profile and can be used in any new PowerShell session to refresh the PATH variable.

### Linux
Run the installation script with sudo:
```bash
sudo bash install-ffmpeg-linux.sh
```

### Manual Installation
If the scripts don't work for your system, you can download FFmpeg manually:
- Windows: https://ffmpeg.org/download.html
- Mac: `brew install ffmpeg`
- Linux: Use your distribution's package manager

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create `.env` file with your API keys:
```bash
# Required for all modes
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here

# Required for transcription
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_s3_bucket_name
ASSEMBLYAI_API_KEY=your_assemblyai_key_here
```
4. Build the application:
```bash
npm run build
```

## Usage

### Important Note
The application automatically removes and recreates the output directory for each video before processing. Make sure to backup any important files from previous runs before processing the same video again.

### Video Folder
The application processes all supported video files from the `./video` folder in the project root. Place your video files in this folder before running the application.

### Production Mode
Run the application to process all videos in the `./video` folder:

```bash
# Process all videos with both audio and images
npm start

# Process all videos with audio only (no image analysis)
npm start no-images

# Process only transcription (no AI analysis)
npm start only-transcribe

# Combine options
npm start no-images only-transcribe
```

### Development Mode
For development with automatic reloading:

```bash
# Run with ts-node and watch for changes
npm run dev

# Run with debugger enabled
npm run dev:debug

# Run with no images
npm run dev no-images

# Run with only transcription (no AI analysis)
npm run dev only-transcribe
```

The application will create an `output` directory containing:
- Original video file (copied for reference)
- Extracted audio file
- Frame images (if not using no-images)
- Transcriptions in JSON format (one per transcription service, plus a combined file)
- Analysis results from each AI model in separate files

### Matrix Mode Results

The application creates a matrix of results by:
1. Transcribing the audio with all four transcription services (OpenAI Whisper, Amazon Transcribe, AssemblyAI, and Google Gemini)
2. Processing each transcription with all three AI models (unless only-transcribe flag is used)

This results in the following output files:
```
output/
└── video_name/
    ├── video_name.mp4                                     # Original video (copied)
    ├── audio.mp3                                          # Extracted audio
    ├── transcription_openai.json                          # OpenAI Whisper transcription (structured JSON)
    ├── transcription_openai_raw.txt                       # OpenAI Whisper transcription (raw text)
    ├── transcription_amazon.json                          # Amazon Transcribe transcription (structured JSON)
    ├── transcription_amazon_raw.txt                       # Amazon Transcribe transcription (raw text)
    ├── transcription_assemblyai.json                      # AssemblyAI transcription (structured JSON)
    ├── transcription_assemblyai_raw.txt                   # AssemblyAI transcription (raw text)
    ├── transcription_gemini.json                          # Google Gemini transcription (structured JSON)
    ├── transcription_gemini_raw.txt                       # Google Gemini transcription (raw text)
    ├── frames/                                            # Frames directory (if images enabled)
    │   ├── frame-0.jpg                                    # Frame at 0 seconds
    │   ├── frame-1.jpg                                    # Frame at 1 second
    │   └── ...
    ├── analysis_openai_transcribed_by_openai.json         # OpenAI analysis of OpenAI transcription
    ├── analysis_anthropic_transcribed_by_openai.json      # Anthropic analysis of OpenAI transcription
    ├── analysis_gemini_transcribed_by_openai.json         # Gemini analysis of OpenAI transcription
    ├── analysis_openai_transcribed_by_amazon.json         # OpenAI analysis of Amazon transcription
    ├── analysis_anthropic_transcribed_by_amazon.json      # Anthropic analysis of Amazon transcription
    ├── analysis_gemini_transcribed_by_amazon.json         # Gemini analysis of Amazon transcription
    ├── analysis_openai_transcribed_by_assemblyai.json     # OpenAI analysis of AssemblyAI transcription
    ├── analysis_anthropic_transcribed_by_assemblyai.json  # Anthropic analysis of AssemblyAI transcription
    ├── analysis_gemini_transcribed_by_assemblyai.json     # Gemini analysis of AssemblyAI transcription
    ├── analysis_openai_transcribed_by_gemini.json         # OpenAI analysis of Gemini transcription
    ├── analysis_anthropic_transcribed_by_gemini.json      # Anthropic analysis of Gemini transcription
    └── analysis_gemini_transcribed_by_gemini.json         # Gemini analysis of Gemini transcription
```

With images enabled, the filenames will include `_with_images` suffix.

### Models Used

When processing with images:
- OpenAI: GPT-4 with Vision capabilities
- Anthropic: Claude 3 Opus
- Google: Gemini Pro Vision

When processing without images:
- OpenAI: GPT-4
- Anthropic: Claude 3 Opus
- Google: Gemini Pro

### Operation Modes

The application supports several operation modes:

1. **Full Analysis Mode** (default)
   - Extracts frames from video (if not disabled)
   - Transcribes audio with all three services
   - Analyzes content with all three AI models
   - Creates a full matrix of results
   - Command: `npm start /path/to/video.mp4`

2. **Audio-Only Mode**
   - Skips frame extraction
   - Transcribes audio with all three services
   - Analyzes transcriptions with all three AI models
   - Useful for faster processing
   - Command: `npm start /path/to/video.mp4 no-images`

3. **Transcription-Only Mode**
   - Can be used with or without images
   - Transcribes audio with all three services
   - Creates combined transcription file
   - Skips AI analysis completely
   - Useful when you only need transcriptions
   - Command: `npm start /path/to/video.mp4 only-transcribe`

4. **Minimal Mode** (audio-only and transcription-only)
   - Skips frame extraction
   - Transcribes audio with all three services
   - Skips AI analysis completely
   - Fastest processing option
   - Command: `npm start /path/to/video.mp4 no-images only-transcribe`

### Transcription Services

The application uses four transcription services:

1. **OpenAI Whisper**
   - Fast, accurate transcription
   - Supports multiple languages
   - No additional setup required beyond OpenAI API key
   - Saved as `transcription_openai.json` and `transcription_openai_raw.txt`

2. **Amazon Transcribe**
   - Higher accuracy for specific languages
   - Better handling of domain-specific terminology
   - Requires AWS credentials and S3 bucket
   - May take longer due to AWS job processing
   - Files automatically deleted from S3 after processing
   - Saved as `transcription_amazon.json` and `transcription_amazon_raw.txt`

3. **AssemblyAI**
   - High quality, human-level accuracy
   - Excellent for specialized content and accents
   - Features text formatting and punctuation
   - Removes disfluencies (like "um" and "uh")
   - Saved as `transcription_assemblyai.json` and `transcription_assemblyai_raw.txt`

4. **Google Gemini**
   - Direct audio transcription using Gemini 1.5 Flash model
   - Processes native audio files with advanced AI recognition
   - Provides accurate timestamps and high-quality transcription
   - Uses the same Google API key as analysis
   - Saved as `transcription_gemini.json` and `transcription_gemini_raw.txt`

Each service produces two file formats:
- A structured JSON file (*.json) containing segments with timestamps
- A raw text file (*.txt) containing just the transcribed content without any timestamps or other formatting

Each transcription JSON file contains segments with:
- `start`: Start time in seconds
- `end`: End time in seconds
- `text`: Transcribed text for that segment

## Development

The project includes several npm scripts:

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled JavaScript
- `npm run dev` - Run in development mode with auto-reload
- `npm run dev:debug` - Run in development mode with debugger enabled

When using `dev` or `dev:debug`, the application will automatically restart when you make changes to the source code.

## Output Structure

The application creates a separate directory for each processed video in the `output` folder.

### Default Mode Output

In standard mode (with AI analysis), all processed videos produce the following files:

```
output/
└── video_name/
    ├── video_name.mp4                                     # Original video (copied)
    ├── audio.mp3                                          # Extracted audio
    ├── transcription_openai.json                          # OpenAI Whisper transcription (structured JSON)
    ├── transcription_openai_raw.txt                       # OpenAI Whisper transcription (raw text)
    ├── transcription_amazon.json                          # Amazon Transcribe transcription (structured JSON)
    ├── transcription_amazon_raw.txt                       # Amazon Transcribe transcription (raw text)
    ├── transcription_assemblyai.json                      # AssemblyAI transcription (structured JSON)
    ├── transcription_assemblyai_raw.txt                   # AssemblyAI transcription (raw text)
    ├── transcription_gemini.json                          # Google Gemini transcription (structured JSON)
    ├── transcription_gemini_raw.txt                       # Google Gemini transcription (raw text)
    ├── frames/                                            # Frames directory (if images enabled)
    │   ├── frame-0.jpg                                    # Frame at 0 seconds
    │   ├── frame-1.jpg                                    # Frame at 1 second
    │   └── ...
    ├── analysis_openai_transcribed_by_openai.json         # OpenAI analysis of OpenAI transcription
    ├── analysis_anthropic_transcribed_by_openai.json      # Anthropic analysis of OpenAI transcription
    ├── analysis_gemini_transcribed_by_openai.json         # Gemini analysis of OpenAI transcription
    ├── analysis_openai_transcribed_by_amazon.json         # OpenAI analysis of Amazon transcription
    ├── analysis_anthropic_transcribed_by_amazon.json      # Anthropic analysis of Amazon transcription
    ├── analysis_gemini_transcribed_by_amazon.json         # Gemini analysis of Amazon transcription
    ├── analysis_openai_transcribed_by_assemblyai.json     # OpenAI analysis of AssemblyAI transcription
    ├── analysis_anthropic_transcribed_by_assemblyai.json  # Anthropic analysis of AssemblyAI transcription
    ├── analysis_gemini_transcribed_by_assemblyai.json     # Gemini analysis of AssemblyAI transcription
    ├── analysis_openai_transcribed_by_gemini.json         # OpenAI analysis of Gemini transcription
    ├── analysis_anthropic_transcribed_by_gemini.json      # Anthropic analysis of Gemini transcription
    └── analysis_gemini_transcribed_by_gemini.json         # Gemini analysis of Gemini transcription
```

### Transcription-Only Mode Output

When using the `only-transcribe` flag, the output directory will contain only:

```
output/
└── video_name/
    ├── video_name.mp4                                     # Original video (copied)
    ├── audio.mp3                                          # Extracted audio
    ├── transcription_openai.json                          # OpenAI Whisper transcription (structured JSON)
    ├── transcription_openai_raw.txt                       # OpenAI Whisper transcription (raw text)
    ├── transcription_amazon.json                          # Amazon Transcribe transcription (structured JSON)
    ├── transcription_amazon_raw.txt                       # Amazon Transcribe transcription (raw text)
    ├── transcription_assemblyai.json                      # AssemblyAI transcription (structured JSON)
    ├── transcription_assemblyai_raw.txt                   # AssemblyAI transcription (raw text)
    ├── transcription_gemini.json                          # Google Gemini transcription (structured JSON)
    ├── transcription_gemini_raw.txt                       # Google Gemini transcription (raw text)
    └── frames/                                            # Frames directory (if images enabled)
        ├── frame-0.jpg                                    # Frame at 0 seconds
        ├── frame-1.jpg                                    # Frame at 1 second
        └── ...
```

With images enabled, the filenames for analysis will include `_with_images` suffix.

Each analysis file contains a lesson in JSON format with:
- Lesson title and description
- 2-7 memory cards
- 1-3 quiz cards
- 1 open-ended question 

## Frame Extraction

The application extracts one frame per second from the video while preserving the original aspect ratio:
- Maximum dimension is 1280 pixels (width or height)
- Aspect ratio is maintained to prevent distortion
- If the video is smaller than 1280 pixels, original dimensions are kept
- Frames are saved as JPEG files with high quality

For example:
- 1920x1080 video → 1280x720 frames
- 3840x2160 video → 1280x720 frames
- 1280x720 video → 1280x720 frames (unchanged)
- 720x1280 video → 720x1280 frames (unchanged)
- 2160x3840 video → 720x1280 frames
