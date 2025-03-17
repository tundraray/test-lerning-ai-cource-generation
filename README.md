# Video Processing Application

This application processes video files by:
1. Extracting audio
2. Capturing frames at 1 FPS (one frame per second) with preserved aspect ratio
3. Transcribing audio using BOTH OpenAI Whisper AND Amazon Transcribe
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
  - Amazon Web Services (required by default)

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

# Required by default (since the app uses Amazon Transcribe by default)
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_s3_bucket_name
```
4. Build the application:
```bash
npm run build
```

## Usage

### Important Note
The application automatically removes and recreates the output directory for each video before processing. Make sure to backup any important files from previous runs before processing the same video again.

### Production Mode
Run the application with a video file path as an argument:

```bash
# Process video with both audio and images
npm start /path/to/your/video.mp4

# Process video with audio only (no image analysis)
npm start /path/to/your/video.mp4 no-images
```

### Development Mode
For development with automatic reloading:

```bash
# Run with ts-node and watch for changes
npm run dev /path/to/your/video.mp4

# Run with debugger enabled
npm run dev:debug /path/to/your/video.mp4

# Run with no images
npm run dev /path/to/your/video.mp4 no-images
```

The application will create an `output` directory containing:
- Extracted audio file
- Frame images (if not using no-images)
- Transcriptions in JSON format (one per transcription service, plus a combined file)
- Analysis results from each AI model in separate files

### Matrix Mode Results

The application always creates a matrix of results by:
1. Transcribing the audio with both OpenAI Whisper and Amazon Transcribe
2. Processing each transcription with all three AI models
3. Saving a combined file with all transcriptions for comparison

This results in the following output files:
```
output/
└── video_name/
    ├── audio.mp3                                        # Extracted audio
    ├── transcription_openai.json                        # OpenAI Whisper transcription
    ├── transcription_amazon.json                        # Amazon Transcribe transcription
    ├── all_transcriptions.json                          # Combined transcriptions file
    ├── frames/                                          # Frames directory (if images enabled)
    │   ├── frame-0.jpg                                  # Frame at 0 seconds
    │   ├── frame-1.jpg                                  # Frame at 1 second
    │   └── ...
    ├── analysis_openai_transcribed_by_openai.json       # OpenAI analysis of OpenAI transcription
    ├── analysis_anthropic_transcribed_by_openai.json    # Anthropic analysis of OpenAI transcription
    ├── analysis_gemini_transcribed_by_openai.json       # Gemini analysis of OpenAI transcription
    ├── analysis_openai_transcribed_by_amazon.json       # OpenAI analysis of Amazon transcription
    ├── analysis_anthropic_transcribed_by_amazon.json    # Anthropic analysis of Amazon transcription
    └── analysis_gemini_transcribed_by_amazon.json       # Gemini analysis of Amazon transcription
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

### Transcription Services

The application supports two transcription services:

1. **OpenAI Whisper**
   - Fast, accurate transcription
   - Supports multiple languages
   - No additional setup required beyond OpenAI API key
   - Saved as `transcription_openai.json`

2. **Amazon Transcribe**
   - Higher accuracy for specific languages
   - Better handling of domain-specific terminology
   - Requires AWS credentials and S3 bucket
   - May take longer due to AWS job processing
   - Saved as `transcription_amazon.json`

By default, BOTH services are used to create a comprehensive comparison, with all transcriptions also stored in a unified `all_transcriptions.json` file that contains:
- Timestamp of processing
- Video name
- List of transcription services used
- Complete transcription data from each service

Each transcription file contains segments with:
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

All processed videos will produce the following files:

```
output/
└── video_name/
    ├── audio.mp3                                        # Extracted audio
    ├── transcription_openai.json                        # OpenAI Whisper transcription
    ├── transcription_amazon.json                        # Amazon Transcribe transcription
    ├── all_transcriptions.json                          # Combined transcriptions file
    ├── frames/                                          # Frames directory (if images enabled)
    │   ├── frame-0.jpg                                  # Frame at 0 seconds
    │   ├── frame-1.jpg                                  # Frame at 1 second
    │   └── ...
    ├── analysis_openai_transcribed_by_openai.json       # OpenAI analysis of OpenAI transcription
    ├── analysis_anthropic_transcribed_by_openai.json    # Anthropic analysis of OpenAI transcription
    ├── analysis_gemini_transcribed_by_openai.json       # Gemini analysis of OpenAI transcription
    ├── analysis_openai_transcribed_by_amazon.json       # OpenAI analysis of Amazon transcription
    ├── analysis_anthropic_transcribed_by_amazon.json    # Anthropic analysis of Amazon transcription
    └── analysis_gemini_transcribed_by_amazon.json       # Gemini analysis of Amazon transcription
```

With images enabled, the filenames will include `_with_images` suffix.

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
