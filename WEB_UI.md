# Video Watermark Remover - Web UI

A beautiful, modern web interface for removing watermarks from videos. Built with clean design principles and smooth user experience.

## Features

### Clean & Modern Design
- **Gradient Background**: Eye-catching purple gradient background
- **Smooth Animations**: Fluid transitions and hover effects
- **Responsive Layout**: Works perfectly on desktop, tablet, and mobile
- **Professional UI**: Inspired by modern SaaS applications

### User-Friendly Workflow
1. **Upload Section**
   - Drag & drop video files
   - Click to browse files
   - Visual feedback on drag-over
   - File size and format validation

2. **Processing View**
   - Video preview while processing
   - Real-time progress bar with percentage
   - Step-by-step status indicators
   - Animated progress effects

3. **Results Page**
   - Success animation
   - One-click download
   - Processing stats (time, file size)
   - Option to process another video

### Processing Steps Visualization
The UI shows 4 clear processing steps:
- 📤 **Uploading**: Video upload to server
- 🔍 **Detecting**: AI watermark detection
- ✂️ **Removing**: Watermark removal process
- ✨ **Enhancing**: Video quality enhancement

## Installation

### Prerequisites
Same as the CLI version:
- Node.js 18+
- FFmpeg
- yt-dlp (optional, for URL downloads)

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the web server**:
   ```bash
   npm run server
   ```

3. **Open your browser**:
   ```
   http://localhost:3000
   ```

### Development Mode

Run with auto-reload on file changes:
```bash
npm run dev:server
```

## Usage

### Basic Usage

1. Open http://localhost:3000 in your browser
2. Drag and drop a video file or click "Browse Files"
3. Wait for processing to complete
4. Click "Download Video" to get your watermark-free video

### Supported Formats

- MP4 (recommended)
- MOV
- AVI
- WebM
- MKV

### File Size Limits

- Maximum: 500MB per video
- Recommended: Under 100MB for faster processing

## API Endpoints

The web server exposes several REST API endpoints:

### POST /api/process
Upload and process a video file.

**Request**:
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `video` field with video file

**Response**:
```json
{
  "success": true,
  "jobId": "abc123...",
  "message": "Video uploaded successfully. Processing started."
}
```

### GET /api/status/:jobId
Get the current status of a processing job.

**Response**:
```json
{
  "jobId": "abc123...",
  "step": "removing",
  "progress": 50,
  "message": "Removing watermarks...",
  "status": "processing"
}
```

**Steps**:
- `uploading` - Video is being uploaded
- `detecting` - Detecting watermark regions
- `removing` - Removing watermarks
- `enhancing` - Enhancing video quality
- `completed` - Processing finished
- `error` - An error occurred

### GET /download/:filename
Download the processed video file.

**Response**: Binary video file

### GET /api/health
Health check endpoint.

**Response**:
```json
{
  "status": "ok"
}
```

## Architecture

```
video-watermark-remover/
├── public/                      # Static web files
│   ├── index.html              # Main HTML page
│   ├── css/
│   │   └── style.css           # Stylesheet
│   └── js/
│       └── app.js              # Client-side JavaScript
├── server.js                    # Express server
├── src/                        # Core processing logic
│   └── ...
├── uploads/                    # Temporary upload storage
├── output/                     # Processed videos
└── temp/                       # Temporary processing files
```

## Configuration

### Server Configuration

Edit `server.js` to modify:

```javascript
const PORT = process.env.PORT || 3000;  // Server port

// File size limits
limits: {
    fileSize: 500 * 1024 * 1024  // 500MB
}

// Auto-cleanup after 1 hour
setTimeout(() => {
    // Cleanup logic
}, 60 * 60 * 1000);
```

### Processing Configuration

The server uses the same configuration as the CLI tool. You can modify the pipeline settings in `server.js`:

```javascript
const pipeline = new VideoPipeline({
    output: {
        directory: OUTPUT_DIR,
        format: 'mp4',
        quality: 'high'
    },
    watermark: {
        detection: {
            method: 'auto',
            sensitivity: 0.7
        },
        removal: {
            method: 'inpaint',
            iterations: 3
        }
    },
    enhancement: {
        enabled: true,
        denoise: true,
        sharpen: false
    }
});
```

## Customization

### Styling

All styles are in `public/css/style.css`. You can customize:

- **Colors**: Edit CSS variables in `:root`
  ```css
  :root {
      --primary: #667eea;
      --secondary: #764ba2;
      --success: #10b981;
      /* ... more colors */
  }
  ```

- **Layout**: Modify responsive breakpoints
  ```css
  @media (max-width: 768px) {
      /* Mobile styles */
  }
  ```

- **Animations**: Adjust timing and effects
  ```css
  @keyframes shimmer {
      /* Animation keyframes */
  }
  ```

### Branding

1. Update the logo in `public/index.html`
2. Change the gradient colors in CSS
3. Modify text content and labels

## Deployment

### Production Deployment

1. **Set environment variables**:
   ```bash
   export PORT=8080
   export NODE_ENV=production
   ```

2. **Use a process manager**:
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start server.js --name watermark-remover
   ```

3. **Use a reverse proxy** (nginx recommended):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       # Increase timeout for large uploads
       client_max_body_size 500M;
       proxy_read_timeout 600s;
   }
   ```

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t watermark-remover .
docker run -p 3000:3000 -v $(pwd)/output:/app/output watermark-remover
```

## Performance Tips

1. **Server Resources**
   - Recommended: 4GB+ RAM
   - CPU: Multi-core for concurrent processing
   - Storage: Fast SSD for temporary files

2. **Optimization**
   - Enable gzip compression
   - Implement job queue for concurrent requests
   - Add Redis for job status tracking
   - Use CDN for static assets

3. **Scaling**
   - Use load balancer for multiple instances
   - Separate upload/processing workers
   - Implement background job queue (Bull, BeeQueue)

## Troubleshooting

### Port Already in Use
```bash
# Change port
PORT=8080 npm run server
```

### Upload Fails
- Check file size limit
- Verify video format
- Check disk space
- Review server logs

### Processing Stuck
- Check FFmpeg installation
- Review server console for errors
- Verify temp directory is writable
- Check available memory

### Download Not Working
- Verify output file exists
- Check file permissions
- Review browser console

## Security Considerations

⚠️ **Important**: This is a demo application. For production use:

1. **Add authentication**: Protect endpoints with API keys or OAuth
2. **Rate limiting**: Prevent abuse with rate limits
3. **File validation**: Strict MIME type checking
4. **Sanitization**: Sanitize all file names
5. **HTTPS**: Always use SSL in production
6. **Storage limits**: Implement user quotas
7. **Virus scanning**: Scan uploaded files
8. **CORS**: Configure appropriate CORS policies

Example rate limiting with express-rate-limit:
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // limit each IP to 5 requests per windowMs
});

app.use('/api/', limiter);
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Future Enhancements

Potential features to add:

- [ ] User accounts and history
- [ ] Multiple watermark region selection UI
- [ ] Before/After comparison view
- [ ] Batch upload support
- [ ] Video trimming before processing
- [ ] Custom watermark region drawing
- [ ] Processing presets (fast, balanced, quality)
- [ ] Job queue with priority
- [ ] Email notifications
- [ ] Cloud storage integration (S3, GCS)
- [ ] Real-time processing preview

## Contributing

Contributions are welcome! Areas for improvement:

- UI/UX enhancements
- Performance optimizations
- Additional video format support
- Better error handling
- Mobile app version

## License

MIT License - See LICENSE file for details

## Support

- Check the main README.md for general information
- Review server logs for detailed error messages
- Open an issue on GitHub for bugs/features
