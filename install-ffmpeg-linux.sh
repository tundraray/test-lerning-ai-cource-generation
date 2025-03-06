#!/bin/bash

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Detect package manager
if command -v apt-get >/dev/null; then
    # Debian/Ubuntu
    echo "Detected Debian/Ubuntu system"
    apt-get update
    apt-get install -y ffmpeg
elif command -v dnf >/dev/null; then
    # Fedora
    echo "Detected Fedora system"
    dnf install -y https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
    dnf install -y ffmpeg
elif command -v yum >/dev/null; then
    # CentOS/RHEL
    echo "Detected CentOS/RHEL system"
    yum install -y epel-release
    yum install -y ffmpeg ffmpeg-devel
elif command -v pacman >/dev/null; then
    # Arch Linux
    echo "Detected Arch Linux system"
    pacman -Sy --noconfirm ffmpeg
else
    echo "Unsupported package manager. Please install FFmpeg manually."
    exit 1
fi

# Verify installation
if command -v ffmpeg >/dev/null; then
    echo "FFmpeg has been installed successfully!"
    ffmpeg -version | head -n 1
else
    echo "FFmpeg installation failed."
    exit 1
fi 