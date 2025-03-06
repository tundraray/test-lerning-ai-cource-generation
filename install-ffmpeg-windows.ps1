# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Check if FFmpeg is already installed
$ffmpegPath = [Environment]::GetEnvironmentVariable('PATH', 'Machine') -split ';' | Where-Object { $_ -like '*ffmpeg*' }
if ($ffmpegPath) {
    Write-Host "FFmpeg is already installed at: $ffmpegPath"
    exit 0
}

# Create temporary directory
$tempDir = Join-Path $env:TEMP 'ffmpeg-install'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

# Download FFmpeg
$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
$zipPath = Join-Path $tempDir 'ffmpeg.zip'

Write-Host "Downloading FFmpeg..."
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zipPath

# Extract FFmpeg
Write-Host "Extracting FFmpeg..."
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

# Determine installation directory
$programDir = if ($isAdmin) {
    "C:\Program Files\FFmpeg"
} else {
    Join-Path $env:USERPROFILE "FFmpeg"
}

Write-Host "Installing FFmpeg to: $programDir"

# Create program directory
try {
    New-Item -ItemType Directory -Force -Path $programDir | Out-Null
} catch {
    Write-Host "Failed to create directory at $programDir"
    Write-Host "Error: $_"
    exit 1
}

# Move FFmpeg files
Write-Host "Installing FFmpeg..."
$ffmpegExtracted = Get-ChildItem -Path $tempDir -Filter "ffmpeg-master-latest-win64-gpl" -Directory | Select-Object -First 1
try {
    Copy-Item -Path "$($ffmpegExtracted.FullName)\bin\*" -Destination $programDir -Force
} catch {
    Write-Host "Failed to copy FFmpeg files"
    Write-Host "Error: $_"
    exit 1
}

# Add to PATH
try {
    if ($isAdmin) {
        $scope = 'Machine'
    } else {
        $scope = 'User'
    }
    
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', $scope)
    if (-not ($currentPath -split ';' -contains $programDir)) {
        [Environment]::SetEnvironmentVariable('PATH', "$currentPath;$programDir", $scope)
        Write-Host "Added FFmpeg to $scope PATH"
    }

    # Refresh PATH in current session
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    # Create a function to reload PATH in PowerShell profile
    $profileContent = @'
# Function to reload PATH
function Update-PathEnv {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-Host "PATH has been updated in current session"
}
'@

    # Add to PowerShell profile if it doesn't exist
    $profilePath = $PROFILE.CurrentUserAllHosts
    if (-not (Test-Path $profilePath)) {
        New-Item -ItemType File -Path $profilePath -Force | Out-Null
    }
    
    if (-not (Get-Content $profilePath | Select-String -Pattern "function Update-PathEnv" -Quiet)) {
        Add-Content -Path $profilePath -Value "`n$profileContent"
        Write-Host "Added Update-PathEnv function to PowerShell profile"
    }

} catch {
    Write-Host "Failed to update PATH"
    Write-Host "Error: $_"
    Write-Host "Please add $programDir to your PATH manually"
}

# Clean up
Remove-Item -Path $tempDir -Recurse -Force

Write-Host "`nFFmpeg has been installed successfully to: $programDir"
Write-Host "PATH has been updated in current session"
Write-Host "`nTo update PATH in new PowerShell sessions, you can:"
Write-Host "1. Restart PowerShell"
Write-Host "2. Run: Update-PathEnv"
Write-Host "3. Or restart your computer"

# Print installation details
if (Test-Path (Join-Path $programDir "ffmpeg.exe")) {
    Write-Host "`nVerifying installation:"
    $ffmpegVersion = & "$programDir\ffmpeg.exe" -version 2>&1 | Select-Object -First 1
    Write-Host $ffmpegVersion
} else {
    Write-Host "`nWarning: FFmpeg executable not found at expected location"
    Write-Host "Please verify the installation manually"
} 