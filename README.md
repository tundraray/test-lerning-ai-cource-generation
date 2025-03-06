# Video Processing Application

This application processes video files by:
1. Extracting audio
2. Capturing frames at 1 FPS (one frame per second) with preserved aspect ratio
3. Transcribing audio using OpenAI Whisper
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
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here
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
```

You can also use the no-images flag in development mode:
```bash
npm run dev /path/to/your/video.mp4 no-images
```

The application will create an `output` directory containing:
- Extracted audio file
- Frame images (if not using no-images)
- Analysis results from each AI model in separate files:
  - With images: 
    - `<video_name>_openai_with_images.json`
    - `<video_name>_anthropic_with_images.json`
    - `<video_name>_gemini_with_images.json`
  - Without images:
    - `<video_name>_openai.json`
    - `<video_name>_anthropic.json`
    - `<video_name>_gemini.json`

### Models Used

When processing with images:
- OpenAI: GPT-4 with Vision capabilities
- Anthropic: Claude 3 Opus
- Google: Gemini Pro Vision

When processing without images:
- OpenAI: GPT-4
- Anthropic: Claude 3 Opus
- Google: Gemini Pro

## Development

The project includes several npm scripts:

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled JavaScript
- `npm run dev` - Run in development mode with auto-reload
- `npm run dev:debug` - Run in development mode with debugger enabled

When using `dev` or `dev:debug`, the application will automatically restart when you make changes to the source code.

## Note

Make sure you have FFmpeg installed on your system. You can download it from:
- Windows: https://ffmpeg.org/download.html
- Mac: `brew install ffmpeg`
- Linux: `sudo apt-get install ffmpeg`

## Output Structure

The application creates a separate directory for each processed video in the `output` folder:

```
output/
└── video_name/
    ├── audio.mp3              # Extracted audio
    ├── transcription.json     # Whisper transcription
    ├── frames/               # Extracted video frames (1 frame per second)
    │   ├── frame-0.jpg      # Frame at 0 seconds
    │   ├── frame-1.jpg      # Frame at 1 second
    │   ├── frame-2.jpg      # Frame at 2 seconds
    │   └── ...
    ├── analysis_openai.json        # OpenAI analysis without images
    ├── analysis_openai_with_images.json  # OpenAI analysis with images
    ├── analysis_anthropic.json     # Anthropic analysis without images
    ├── analysis_anthropic_with_images.json  # Anthropic analysis with images
    ├── analysis_gemini.json        # Gemini analysis without images
    └── analysis_gemini_with_images.json  # Gemini analysis with images
```

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
