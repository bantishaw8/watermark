import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import { VideoPipeline } from './src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Create directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TEMP_DIR = path.join(__dirname, 'temp');

await fs.mkdir(UPLOAD_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(TEMP_DIR, { recursive: true });

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
        if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload a video file.'));
        }
    }
});

// Job tracking
const jobs = new Map();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API Routes

// Upload and process video
app.post('/api/process', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        const jobId = crypto.randomBytes(16).toString('hex');
        const inputPath = req.file.path;
        const outputPath = path.join(OUTPUT_DIR, `${jobId}-output.mp4`);

        // Initialize job tracking
        jobs.set(jobId, {
            id: jobId,
            status: 'uploading',
            step: 'uploading',
            progress: 10,
            message: 'Upload complete',
            inputPath,
            outputPath,
            outputFile: null,
            fileSize: 0,
            error: null,
            startTime: Date.now()
        });

        // Start processing in background
        processVideo(jobId, inputPath, outputPath);

        res.json({
            success: true,
            jobId,
            message: 'Video uploaded successfully. Processing started.'
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get processing status
app.get('/api/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
        jobId: job.id,
        step: job.step,
        progress: job.progress,
        message: job.message,
        status: job.status,
        outputFile: job.outputFile,
        fileSize: job.fileSize,
        error: job.error
    });
});

// Download processed video
app.get('/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(OUTPUT_DIR, filename);

        // Check if file exists
        await fs.access(filePath);

        res.download(filePath, 'watermark-removed.mp4', (err) => {
            if (err) {
                console.error('Download error:', err);
            }
        });
    } catch (error) {
        res.status(404).json({ error: 'File not found' });
    }
});

// Process video function
async function processVideo(jobId, inputPath, outputPath) {
    const job = jobs.get(jobId);

    try {
        // Update status: detecting
        job.step = 'detecting';
        job.progress = 30;
        job.message = 'Detecting watermarks...';

        // Create pipeline with advanced content-aware watermark removal
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
                    method: 'content-aware',  // Use advanced content-aware fill for complete removal
                    iterations: 3
                }
            },
            enhancement: {
                enabled: true,
                denoise: true,
                sharpen: false
            },
            processing: {
                tempDirectory: TEMP_DIR,
                cleanupTemp: true
            }
        });

        // Add progress callback
        pipeline.on = (event, callback) => {
            // Simple event emitter simulation
            if (event === 'progress') {
                pipeline._progressCallback = callback;
            }
        };

        // Wrap process method to track progress
        const originalProcess = pipeline.process.bind(pipeline);
        pipeline.process = async (input) => {
            // Update to removing step
            job.step = 'removing';
            job.progress = 50;
            job.message = 'Removing watermarks...';

            const result = await originalProcess(input);

            // Update to enhancing step
            job.step = 'enhancing';
            job.progress = 75;
            job.message = 'Enhancing video quality...';

            return result;
        };

        // Process the video
        const result = await pipeline.process(inputPath);

        // Get output file info
        const stats = await fs.stat(result.outputPath);
        const outputFileName = path.basename(result.outputPath);

        // Update job as completed
        job.step = 'completed';
        job.status = 'completed';
        job.progress = 100;
        job.message = 'Processing complete!';
        job.outputFile = outputFileName;
        job.fileSize = stats.size;

        // Clean up input file
        try {
            await fs.unlink(inputPath);
        } catch (err) {
            console.error('Failed to delete input file:', err);
        }

        // Schedule cleanup of output file after 1 hour
        setTimeout(async () => {
            try {
                await fs.unlink(result.outputPath);
                jobs.delete(jobId);
            } catch (err) {
                console.error('Failed to cleanup:', err);
            }
        }, 60 * 60 * 1000);

    } catch (error) {
        console.error('Processing error:', error);

        job.step = 'error';
        job.status = 'error';
        job.error = error.message;
        job.message = 'Processing failed';

        // Clean up on error
        try {
            await fs.unlink(inputPath);
        } catch (err) {
            // Ignore
        }
    }
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║  Video Watermark Remover Server            ║
║  Running on http://localhost:${PORT}       ║
╚════════════════════════════════════════════╝

Open your browser and navigate to:
http://localhost:${PORT}
    `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');

    // Clean up temp files
    try {
        const files = await fs.readdir(TEMP_DIR);
        await Promise.all(files.map(file => fs.unlink(path.join(TEMP_DIR, file))));
    } catch (err) {
        // Ignore
    }

    process.exit(0);
});
