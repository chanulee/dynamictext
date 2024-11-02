const defaultValues = {
    'master-height': 50,
    'weight': 300,
    'slant': 0,
    'width': 100,
    'counter-width': 426,
    'uppercase-height': 644,
    'lowercase-height': 493,
    'ascender-height': 750,
    'figure-height': 674,
    'descender-depth': -203
};

const heightControls = {
    'uppercase-height': { min: 528, max: 760, default: 644 },
    'lowercase-height': { min: 416, max: 570, default: 493 },
    'ascender-height': { min: 649, max: 854, default: 750 },
    'figure-height': { min: 560, max: 788, default: 674 },
    'descender-depth': { min: -305, max: -98, default: -203, inverse: true }
};

function updateHeightControls(percentage) {
    Object.entries(heightControls).forEach(([id, range]) => {
        const input = document.getElementById(id);
        const valueDisplay = document.getElementById(`${id}-value`);
        const range_size = range.max - range.min;
        // For descender, invert the percentage since we want it to go deeper (more negative) as height increases
        const effectivePercentage = range.inverse ? (100 - percentage) : percentage;
        const value = Math.round(range.min + (range_size * (effectivePercentage / 100)));
        input.value = value;
        valueDisplay.textContent = value;
    });
}

const masterHeightControl = document.getElementById('master-height');
masterHeightControl.addEventListener('input', (e) => {
    const percentage = parseInt(e.target.value);
    document.getElementById('master-height-value').textContent = `${percentage}%`;
    updateHeightControls(percentage);
    updateFontVariationSettings();
});

const controls = document.querySelectorAll('input[type="range"]');
const previewElements = document.querySelectorAll('.preview-text, .sample-text');
const resetButton = document.getElementById('reset');

function updateFontVariationSettings() {
    const settings = {
        'wght': document.getElementById('weight').value,
        'slnt': document.getElementById('slant').value,
        'wdth': document.getElementById('width').value,
        'XTRA': document.getElementById('counter-width').value,
        'YTUC': document.getElementById('uppercase-height').value,
        'YTLC': document.getElementById('lowercase-height').value,
        'YTAS': document.getElementById('ascender-height').value,
        'YTDE': document.getElementById('descender-depth').value,
        'YTFI': document.getElementById('figure-height').value,
        'GRAD': 8,
        'XOPQ': 138,
        'YOPQ': 61
    };

    const fontSettings = Object.entries(settings)
        .map(([key, value]) => `"${key}" ${value}`)
        .join(', ');

    previewElements.forEach(element => {
        element.style.fontVariationSettings = fontSettings;
    });
}

controls.forEach(control => {
    if (control.id !== 'master-height') {
        control.addEventListener('input', (e) => {
            document.getElementById(`${e.target.id}-value`).textContent = e.target.value;
            updateFontVariationSettings();
        });
    }
});

resetButton.addEventListener('click', () => {
    Object.entries(defaultValues).forEach(([id, value]) => {
        const input = document.getElementById(id);
        const valueDisplay = document.getElementById(`${id}-value`);
        input.value = value;
        valueDisplay.textContent = id === 'master-height' ? `${value}%` : value;
    });
    updateHeightControls(defaultValues['master-height']);
    updateFontVariationSettings();
});

// Initial update
updateFontVariationSettings();

// Add these updates to the script section
const smoothingSlider = document.getElementById('smoothingSlider');
const smoothingLabel = smoothingSlider.parentElement.querySelector('.rate-label');

smoothingSlider.addEventListener('input', (e) => {
    smoothingFactor = parseInt(e.target.value) / 100;
    smoothingLabel.textContent = `Smoothing: ${smoothingFactor.toFixed(2)}`;
});

// Audio wave functionality
let audioContext;
let analyser;
let dataArray;
let animationId;
let isRecording = false;
let recordingStartTime;
let waveformHistory = [];
let lastSampleTime = 0;
let sampleInterval = 20;
let recognition;

const canvas = document.getElementById('waveform');
const ctx = canvas.getContext('2d');
const transcriptionDiv = document.getElementById('transcription');
canvas.width = canvas.parentElement.clientWidth;
const width = canvas.width;
const height = canvas.height;
const timerElement = document.getElementById('timer');
const rateSlider = document.getElementById('rateSlider');
const rateLabel = document.querySelector('.rate-label');

const AMPLIFICATION = 3.5;
const MIN_AMPLITUDE = 0.5;
const NOISE_THRESHOLD = 2;
const BAR_SPACING = 3;
const BAR_WIDTH = 2;

// Initialize speech recognition
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        // Get the existing final transcript from the div (excluding any interim text)
        finalTranscript = transcriptionDiv.innerHTML.replace(/<span[^>]*>.*?<\/span>/g, '');

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + '\n';
            } else {
                interimTranscript = transcript; // Just use the latest interim result
            }
        }

        transcriptionDiv.innerHTML = finalTranscript + '<span style="color: #666;">' + interimTranscript + '</span>';
        transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
    };
}

rateSlider.addEventListener('input', (e) => {
    sampleInterval = parseInt(e.target.value);
    rateLabel.textContent = `Update Rate: ${sampleInterval}ms`;
});

function updateTimer() {
    if (!isRecording) return;
    const elapsed = Date.now() - recordingStartTime;
    const seconds = Math.floor((elapsed / 1000) % 60);
    const minutes = Math.floor(elapsed / 1000 / 60);
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    setTimeout(updateTimer, 1000);
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        waveformHistory = [];
        recordingStartTime = Date.now();
        lastSampleTime = 0;
        updateTimer();
        draw();

        // Start speech recognition
        if (recognition) {
            recognition.start();
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Error accessing microphone. Please make sure you have a microphone connected and have granted permission to use it.');
    }
}

function stopRecording() {
    if (audioContext) {
        audioContext.close();
    }
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (recognition) {
        recognition.stop();
    }
    timerElement.textContent = '00:00';
}

function clearAll() {
    waveformHistory = [];
    ctx.clearRect(0, 0, width, height);
    transcriptionDiv.innerHTML = '';
}

function toggleRecording() {
    const button = document.querySelector('button');
    if (!isRecording) {
        startRecording();
        button.textContent = 'Stop Recording';
        isRecording = true;
    } else {
        stopRecording();
        button.textContent = 'Start Recording';
        isRecording = false;
    }
}

let smoothedHeight = 50; // Start at default value
const smoothingFactor = 0.1; // Adjust this value between 0 and 1 (lower = smoother)

function draw() {
    if (!isRecording) return;
    animationId = requestAnimationFrame(draw);

    const currentTime = Date.now();
    if (currentTime - lastSampleTime < sampleInterval) {
        return;
    }

    analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += Math.abs(dataArray[i] - 128);
    }
    const average = sum / dataArray.length;
    
    const normalizedAverage = average > NOISE_THRESHOLD ? average : MIN_AMPLITUDE;
    waveformHistory.push(normalizedAverage);

    const maxAmplitude = 50;
    const rawPercentage = (normalizedAverage / maxAmplitude) * 100;
    const targetHeight = Math.min(Math.round(rawPercentage * 0.6 + 30), 80);
    
    // Apply smoothing
    smoothedHeight = smoothedHeight + (smoothingFactor * (targetHeight - smoothedHeight));
    const heightPercentage = Math.round(smoothedHeight);
    
    // Update master height control and trigger updates
    const masterHeightControl = document.getElementById('master-height');
    masterHeightControl.value = heightPercentage;
    document.getElementById('master-height-value').textContent = `${heightPercentage}%`;
    updateHeightControls(heightPercentage);
    updateFontVariationSettings();

    const maxBars = Math.floor(width / (BAR_WIDTH + BAR_SPACING));
    if (waveformHistory.length > maxBars) {
        waveformHistory.shift();
    }

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = BAR_WIDTH;

    waveformHistory.forEach((amplitude, index) => {
        const x = width - (waveformHistory.length - index) * (BAR_WIDTH + BAR_SPACING);
        let normalizedAmplitude;
        
        if (amplitude <= MIN_AMPLITUDE) {
            normalizedAmplitude = 2;
        } else {
            normalizedAmplitude = (amplitude / 128) * (height / 2) * AMPLIFICATION;
        }
        
        ctx.moveTo(x, height/2 - normalizedAmplitude);
        ctx.lineTo(x, height/2 + normalizedAmplitude);
    });

    ctx.stroke();
    lastSampleTime = currentTime;
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = canvas.parentElement.clientWidth;
});

// Make sure all code is wrapped in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize canvas and context
    const canvas = document.getElementById('waveform');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    const width = canvas.width;
    const height = canvas.height;
    
    // Initialize other elements
    const timerElement = document.getElementById('timer');
    const rateSlider = document.getElementById('rateSlider');
    const rateLabel = document.querySelector('.rate-label');
    
    // Add all your event listeners here
    const masterHeightControl = document.getElementById('master-height');
    masterHeightControl.addEventListener('input', (e) => {
        // ... existing master height control logic ...
    });
    
    // ... rest of your initialization code and event listeners ...
});