// DOM Elements
const uploadSection = document.getElementById('uploadSection');
const processingSection = document.getElementById('processingSection');
const resultSection = document.getElementById('resultSection');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const cancelBtn = document.getElementById('cancelBtn');
const downloadBtn = document.getElementById('downloadBtn');
const newVideoBtn = document.getElementById('newVideoBtn');
const videoPreview = document.getElementById('videoPreview');
const videoName = document.getElementById('videoName');
const videoDetails = document.getElementById('videoDetails');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const processingTime = document.getElementById('processingTime');
const fileSize = document.getElementById('fileSize');

// Steps
const steps = {
    upload: document.getElementById('step1'),
    detect: document.getElementById('step2'),
    remove: document.getElementById('step3'),
    enhance: document.getElementById('step4')
};

// State
let currentFile = null;
let uploadAbortController = null;
let processStartTime = null;
let outputFileName = null;

// File Upload Handlers
browseBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFileSelect(file);
    }
});

// Drag and Drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
        handleFileSelect(file);
    } else {
        alert('Please drop a valid video file');
    }
});

uploadArea.addEventListener('click', (e) => {
    if (e.target === uploadArea || uploadArea.contains(e.target)) {
        fileInput.click();
    }
});

// Cancel Button
cancelBtn.addEventListener('click', () => {
    if (uploadAbortController) {
        uploadAbortController.abort();
    }
    resetToUpload();
});

// Download Button
downloadBtn.addEventListener('click', () => {
    if (outputFileName) {
        window.location.href = `/download/${encodeURIComponent(outputFileName)}`;
    }
});

// New Video Button
newVideoBtn.addEventListener('click', () => {
    resetToUpload();
});

// Main File Handler
async function handleFileSelect(file) {
    // Validate file
    if (!file.type.startsWith('video/')) {
        alert('Please select a valid video file');
        return;
    }

    // Check file size (500MB limit)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('File size exceeds 500MB limit');
        return;
    }

    currentFile = file;

    // Show video preview
    const videoUrl = URL.createObjectURL(file);
    videoPreview.src = videoUrl;
    videoName.textContent = file.name;
    videoDetails.textContent = formatFileSize(file.size);

    // Switch to processing view
    showSection('processing');

    // Start processing
    processStartTime = Date.now();
    await uploadAndProcess(file);
}

// Upload and Process
async function uploadAndProcess(file) {
    try {
        uploadAbortController = new AbortController();

        // Create form data
        const formData = new FormData();
        formData.append('video', file);

        // Step 1: Upload
        updateStep('upload', 'active');
        updateProgress(0, 'Uploading video...');

        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData,
            signal: uploadAbortController.signal
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        // Monitor processing status
        await monitorProcessing(result.jobId);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Upload cancelled');
        } else {
            console.error('Error:', error);
            alert('An error occurred: ' + error.message);
        }
        resetToUpload();
    }
}

// Monitor Processing Status
async function monitorProcessing(jobId) {
    const checkInterval = 1000; // Check every second
    let lastStep = null;

    while (true) {
        try {
            const response = await fetch(`/api/status/${jobId}`);
            const status = await response.json();

            // Update progress based on status
            if (status.step !== lastStep) {
                lastStep = status.step;

                switch (status.step) {
                    case 'uploading':
                        updateStep('upload', 'active');
                        updateProgress(10, 'Uploading video...');
                        break;
                    case 'detecting':
                        updateStep('upload', 'completed');
                        updateStep('detect', 'active');
                        updateProgress(30, 'Detecting watermarks...');
                        break;
                    case 'removing':
                        updateStep('detect', 'completed');
                        updateStep('remove', 'active');
                        updateProgress(50, 'Removing watermarks...');
                        break;
                    case 'enhancing':
                        updateStep('remove', 'completed');
                        updateStep('enhance', 'active');
                        updateProgress(75, 'Enhancing video quality...');
                        break;
                    case 'completed':
                        updateStep('enhance', 'completed');
                        updateProgress(100, 'Complete!');

                        // Show result
                        setTimeout(() => {
                            showResult(status.outputFile, status.fileSize);
                        }, 500);
                        return;
                    case 'error':
                        throw new Error(status.error || 'Processing failed');
                }
            }

            // Update progress percentage if available
            if (status.progress !== undefined) {
                updateProgress(status.progress, status.message || progressText.textContent);
            }

            await new Promise(resolve => setTimeout(resolve, checkInterval));

        } catch (error) {
            console.error('Status check error:', error);
            alert('An error occurred during processing: ' + error.message);
            resetToUpload();
            return;
        }
    }
}

// UI Update Functions
function showSection(section) {
    uploadSection.classList.add('hidden');
    processingSection.classList.add('hidden');
    resultSection.classList.add('hidden');

    switch (section) {
        case 'upload':
            uploadSection.classList.remove('hidden');
            break;
        case 'processing':
            processingSection.classList.remove('hidden');
            break;
        case 'result':
            resultSection.classList.remove('hidden');
            break;
    }
}

function updateProgress(percent, text) {
    progressFill.style.width = percent + '%';
    progressPercent.textContent = Math.round(percent) + '%';
    if (text) {
        progressText.textContent = text;
    }
}

function updateStep(stepName, status) {
    const step = steps[stepName];
    if (!step) return;

    step.classList.remove('active', 'completed');
    if (status === 'active') {
        step.classList.add('active');
    } else if (status === 'completed') {
        step.classList.add('completed');
    }
}

function showResult(fileName, size) {
    outputFileName = fileName;

    const elapsed = Date.now() - processStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    processingTime.textContent = timeStr;
    fileSize.textContent = formatFileSize(size);

    showSection('result');
}

function resetToUpload() {
    // Reset state
    currentFile = null;
    uploadAbortController = null;
    processStartTime = null;
    outputFileName = null;

    // Reset UI
    fileInput.value = '';
    videoPreview.src = '';
    updateProgress(0, 'Uploading...');

    // Reset steps
    Object.values(steps).forEach(step => {
        step.classList.remove('active', 'completed');
    });

    // Show upload section
    showSection('upload');
}

// Helper Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Video Watermark Remover initialized');
});
