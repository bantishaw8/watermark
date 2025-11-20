# Installation Guide

Complete installation guide for the Video Watermark Remover.

## System Requirements

- **Operating System**: Windows, macOS, or Linux
- **Node.js**: Version 18.0.0 or higher
- **RAM**: Minimum 4GB (8GB+ recommended for HD videos)
- **Disk Space**: At least 2GB free (depends on video sizes)

## Step-by-Step Installation

### 1. Install Node.js

#### macOS
```bash
# Using Homebrew
brew install node

# Or download from https://nodejs.org/
```

#### Ubuntu/Debian
```bash
# Using apt
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Windows
```bash
# Download installer from https://nodejs.org/
# Or using Chocolatey
choco install nodejs
```

Verify installation:
```bash
node --version  # Should be v18.0.0 or higher
npm --version
```

### 2. Install FFmpeg

FFmpeg is required for video processing.

#### macOS
```bash
brew install ffmpeg
```

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### Windows

**Option 1: Using Chocolatey (Recommended)**
```bash
choco install ffmpeg
```

**Option 2: Manual Installation**
1. Download from https://ffmpeg.org/download.html
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to your PATH environment variable

Verify installation:
```bash
ffmpeg -version
```

### 3. Install yt-dlp

yt-dlp is required for downloading videos from platforms.

#### Using pip (Recommended)
```bash
pip install yt-dlp
```

#### Using npm
```bash
npm install -g yt-dlp
```

#### macOS (using Homebrew)
```bash
brew install yt-dlp
```

#### Ubuntu/Debian
```bash
sudo apt install yt-dlp
```

#### Windows

**Using pip:**
```bash
pip install yt-dlp
```

**Or download binary:**
1. Download from https://github.com/yt-dlp/yt-dlp/releases
2. Rename to `yt-dlp.exe`
3. Place in a directory in your PATH

Verify installation:
```bash
yt-dlp --version
```

### 4. Clone the Repository

```bash
git clone <repository-url>
cd watermark
```

### 5. Install Project Dependencies

```bash
npm install
```

This will install all required Node.js packages:
- fluent-ffmpeg
- commander
- chalk
- ora
- sharp
- and more...

### 6. Test the Installation

```bash
# Check if everything is working
npm start -- --help
```

You should see the help menu with available commands.

## Quick Test

Create a test video or download one:

```bash
# Get video info
npm start info "https://www.youtube.com/watch?v=jNQXAC9IVRw"

# Process a video
npm start process /path/to/test-video.mp4
```

## Troubleshooting

### Issue: "yt-dlp not found"

**Solution:**
```bash
# Install yt-dlp
pip install yt-dlp

# Or use the system package manager
# macOS: brew install yt-dlp
# Ubuntu: sudo apt install yt-dlp
```

### Issue: "FFmpeg not found"

**Solution:**

The project includes `@ffmpeg-installer/ffmpeg`, but for better performance:

```bash
# Install system FFmpeg
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
# Windows: choco install ffmpeg
```

### Issue: "Cannot find module"

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Permission denied" when running CLI

**Solution:**
```bash
# Make CLI executable (macOS/Linux)
chmod +x cli.js

# Or use npm start instead
npm start process video.mp4
```

### Issue: Download fails with "HTTP Error 403"

**Solution:**
- The video might be private or restricted
- Platform may require authentication
- Try updating yt-dlp: `pip install --upgrade yt-dlp`

### Issue: Out of memory errors

**Solution:**
- Process shorter videos
- Reduce target resolution
- Increase Node.js memory limit:
  ```bash
  export NODE_OPTIONS="--max-old-space-size=4096"
  npm start process video.mp4
  ```

### Issue: Slow processing

**Solution:**
- Disable enhancement: `npm start process video.mp4 --no-enhance`
- Use lower quality: `npm start process video.mp4 --quality medium`
- Use manual watermark regions instead of auto-detection

## Updating

Keep your installation up to date:

```bash
# Update dependencies
npm update

# Update yt-dlp (important for platform compatibility)
pip install --upgrade yt-dlp
```

## Platform-Specific Notes

### macOS

If you encounter issues with Sharp (image processing library):

```bash
# Reinstall Sharp
npm uninstall sharp
npm install sharp
```

### Linux

Some distributions may require additional packages:

```bash
# Ubuntu/Debian
sudo apt-get install libvips-dev

# Fedora
sudo dnf install vips-devel
```

### Windows

- Use PowerShell or Command Prompt as Administrator
- Ensure Python is installed (required for yt-dlp if using pip)
- Windows Defender may flag yt-dlp - add exception if needed

## Docker Installation (Alternative)

If you prefer using Docker:

```dockerfile
FROM node:18

RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip

RUN pip3 install yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

ENTRYPOINT ["npm", "start"]
```

Build and run:
```bash
docker build -t watermark-remover .
docker run -v $(pwd)/output:/app/output watermark-remover process video.mp4
```

## Verification Checklist

After installation, verify:

- [ ] Node.js v18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] FFmpeg installed (`ffmpeg -version`)
- [ ] yt-dlp installed (`yt-dlp --version`)
- [ ] Project dependencies installed (`npm install` completed)
- [ ] CLI accessible (`npm start -- --help` shows help menu)
- [ ] Can process a test video

## Getting Help

If you encounter issues not covered here:

1. Check the main README.md
2. Open an issue on GitHub with:
   - Your operating system and version
   - Node.js version
   - FFmpeg version
   - yt-dlp version
   - Complete error message
   - Steps to reproduce

## Next Steps

Once installed, check out:

- [README.md](README.md) - Main documentation and usage
- [examples/usage-example.js](examples/usage-example.js) - Code examples
- [examples/custom-config.json](examples/custom-config.json) - Configuration examples
