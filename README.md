# Video Watermark Remover

Advanced video watermark removal and enhancement tool with multi-platform support. Process local videos or download directly from YouTube, Twitter, Facebook, and Instagram.

## 🌐 Two Ways to Use

### Web Interface (Recommended)
Beautiful, modern web UI with drag-and-drop support, real-time progress tracking, and one-click downloads.

```bash
npm install
npm run server
```

Then open http://localhost:3000 in your browser!

**See [WEB_UI.md](WEB_UI.md) for complete web interface documentation.**

### Command Line Interface (CLI)
Powerful CLI for advanced users and automation.

```bash
npm start process video.mp4
```

## Features

- **🎨 Modern Web UI**: Clean, professional interface with smooth animations
- **📤 Drag & Drop**: Easy video upload with visual feedback
- **📊 Real-time Progress**: Watch processing steps in real-time
- **Multi-Platform Video Download**: Download videos from YouTube, Twitter, Facebook, Instagram
- **Automatic Watermark Detection**: AI-powered detection of watermarks in various positions
- **Intelligent Removal**: Uses FFmpeg's delogo filter and advanced inpainting techniques
- **Video Enhancement**: Upscale to HD, denoise, sharpen, and color correction
- **Batch Processing**: Process multiple videos at once
- **High-Quality Output**: Configurable quality settings for optimal results
- **Easy CLI Interface**: Simple command-line interface for all operations

## Prerequisites

### Required

- **Node.js**: Version 18 or higher
- **FFmpeg**: Required for video processing
- **yt-dlp**: Required for downloading videos from platforms

### Installation

1. **Install Node.js** (if not already installed):
   ```bash
   # Download from https://nodejs.org/ or use a package manager
   ```

2. **Install FFmpeg**:
   ```bash
   # macOS
   brew install ffmpeg

   # Ubuntu/Debian
   sudo apt update
   sudo apt install ffmpeg

   # Windows (using Chocolatey)
   choco install ffmpeg
   ```

3. **Install yt-dlp**:
   ```bash
   # Using pip
   pip install yt-dlp

   # Or download binary from https://github.com/yt-dlp/yt-dlp
   ```

## Quick Start

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd watermark
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Process a video**:
   ```bash
   # Local file
   npm start process /path/to/video.mp4

   # YouTube video
   npm start process "https://www.youtube.com/watch?v=VIDEO_ID"

   # Twitter video
   npm start process "https://twitter.com/user/status/TWEET_ID"

   # Instagram video
   npm start process "https://www.instagram.com/p/POST_ID/"
   ```

## Usage

### Process a Single Video

```bash
npm start process <input> [options]
```

**Options:**
- `-o, --output <path>`: Specify output file path
- `-c, --config <path>`: Use custom configuration file
- `--no-detect`: Skip automatic watermark detection
- `--no-enhance`: Skip video enhancement
- `--region <x,y,w,h>`: Manually specify watermark region(s)
- `--quality <level>`: Set quality level (low, medium, high)
- `--resolution <WxH>`: Set target resolution (e.g., 1920x1080)
- `-v, --verbose`: Enable verbose logging

**Examples:**

```bash
# Process with automatic watermark detection
npm start process video.mp4

# Process with manual watermark region (x=10, y=10, width=200, height=50)
npm start process video.mp4 --region 10,10,200,50

# Process YouTube video with high quality
npm start process "https://youtube.com/watch?v=..." --quality high

# Process and upscale to 4K
npm start process video.mp4 --resolution 3840x2160

# Process with custom output path
npm start process video.mp4 -o ./my-output.mp4
```

### Batch Processing

```bash
npm start batch <input1> <input2> <input3> [options]
```

**Example:**

```bash
npm start batch video1.mp4 video2.mp4 "https://youtube.com/..." --quality high
```

### Get Video Information

```bash
npm start info <input>
```

**Example:**

```bash
npm start info video.mp4
npm start info "https://youtube.com/watch?v=..."
```

### Download Video Only

```bash
npm start download <url> [options]
```

**Example:**

```bash
npm start download "https://youtube.com/watch?v=..." -o my-video.mp4
```

## Configuration

The system uses a default configuration file at `config/default.json`. You can create custom configurations:

```json
{
  "output": {
    "directory": "./output",
    "format": "mp4",
    "quality": "high",
    "resolution": {
      "width": 1920,
      "height": 1080
    }
  },
  "watermark": {
    "detection": {
      "method": "auto",
      "sensitivity": 0.7,
      "minSize": 20,
      "maxSize": 500
    },
    "removal": {
      "method": "inpaint",
      "iterations": 3,
      "blendEdges": true
    }
  },
  "enhancement": {
    "enabled": true,
    "upscale": true,
    "denoise": true,
    "sharpen": false
  }
}
```

Use custom config:
```bash
npm start process video.mp4 -c ./my-config.json
```

## Architecture

```
video-watermark-remover/
├── src/
│   ├── downloader/
│   │   └── VideoDownloader.js      # Multi-platform video downloader
│   ├── detector/
│   │   └── WatermarkDetector.js    # Watermark detection engine
│   ├── remover/
│   │   └── WatermarkRemover.js     # Watermark removal processor
│   ├── enhancer/
│   │   └── VideoEnhancer.js        # Video quality enhancement
│   ├── pipeline/
│   │   └── VideoPipeline.js        # Main orchestration pipeline
│   └── utils/
│       ├── logger.js               # Logging utilities
│       └── fileSystem.js           # File system helpers
├── config/
│   └── default.json                # Default configuration
├── cli.js                          # Command-line interface
└── package.json
```

## How It Works

### 1. Video Acquisition
- Downloads videos from supported platforms using yt-dlp
- Or loads local video files

### 2. Watermark Detection
- Extracts sample frames from the video
- Analyzes common watermark positions (corners, center)
- Uses variance analysis to detect consistent patterns
- Identifies watermark regions that appear across multiple frames

### 3. Watermark Removal
- Uses FFmpeg's `delogo` filter for interpolation-based removal
- Applies edge blending for seamless results
- Supports multi-pass processing for better quality

### 4. Video Enhancement
- Upscales to target resolution using Lanczos algorithm
- Applies denoising filters (hqdn3d)
- Optional sharpening and color correction
- High-quality encoding with optimal settings

## Supported Platforms

- **YouTube**: Full support via yt-dlp
- **Twitter/X**: Full support via yt-dlp
- **Facebook**: Full support via yt-dlp
- **Instagram**: Full support via yt-dlp
- **Generic URLs**: Any video URL supported by yt-dlp

## Performance Tips

1. **Use manual regions** if you know watermark positions (faster than auto-detection)
2. **Disable enhancement** if you only need watermark removal
3. **Adjust quality settings** based on your needs (lower = faster)
4. **Process in batches** for multiple videos
5. **Keep temp files** during development for debugging

## Troubleshooting

### yt-dlp not found
```bash
pip install yt-dlp
# or
npm install -g yt-dlp
```

### FFmpeg not found
```bash
# The package includes @ffmpeg-installer/ffmpeg
# But for better performance, install system FFmpeg
```

### Out of memory
- Reduce video resolution before processing
- Process shorter videos
- Adjust FFmpeg buffer settings

### Download fails
- Check your internet connection
- Verify the URL is accessible
- Some platforms may require authentication

## Advanced Usage

### Programmatic API

```javascript
import { VideoPipeline } from './src/index.js';

const pipeline = new VideoPipeline({
  output: { directory: './output' },
  enhancement: { enabled: true, quality: 'high' }
});

const result = await pipeline.process('video.mp4');
console.log('Output:', result.outputPath);
```

### Custom Watermark Regions

```javascript
const regions = [
  { x: 10, y: 10, width: 200, height: 50 },
  { x: 1720, y: 1030, width: 200, height: 50 }
];

await pipeline.processWithManualRegions('video.mp4', regions);
```

## License

MIT

## Disclaimer

This tool is designed for processing your own videos or videos where you have proper authorization. Always respect copyright and platform Terms of Service. The authors are not responsible for misuse of this software.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.
