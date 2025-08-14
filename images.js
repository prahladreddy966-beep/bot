document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const fileInput = document.getElementById('file-input');
    const fileQuestionNumberInput = document.getElementById('file-question-number');
    const fileCountParagraph = document.getElementById('file-count');
    const cameraStartButton = document.getElementById('camera-start-btn');
    const cameraCaptureButton = document.getElementById('camera-capture-btn');
    const cameraQuestionNumberInput = document.getElementById('camera-question-number');
    const cameraContainer = document.getElementById('camera-container');
    const cameraStreamVideo = document.getElementById('camera-stream');
    const cameraCanvas = document.getElementById('camera-canvas');
    const cameraErrorParagraph = document.getElementById('camera-error');
    const imageGallery = document.getElementById('image-gallery');
    const clearImagesButton = document.getElementById('clear-images-btn');
    const emptyMessage = document.getElementById('empty-message');
    const modeToggle = document.getElementById('mode-toggle');
    const modeDisplay = document.getElementById('mode-display');

    let cameraStream = null;
    let isSingleImageMode = false; // Default is Bulk Mode

    // --- Local Storage Key ---
    const STORAGE_KEY = 'savedImages';

    // --- Utility Functions ---

    /**
     * Updates the image gallery display by fetching images and their metadata from local storage.
     */
    const updateGallery = () => {
        const images = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        imageGallery.innerHTML = ''; // Clear existing images

        if (images.length === 0) {
            emptyMessage.style.display = 'block';
        } else {
            emptyMessage.style.display = 'none';
            images.forEach(imageObj => {
                const imageWrapper = document.createElement('div');
                imageWrapper.className = 'image-item bg-gray-200 rounded-xl overflow-hidden shadow-md transform transition-transform duration-200 hover:scale-105';

                const img = document.createElement('img');
                img.src = imageObj.dataUrl;
                img.alt = 'User uploaded image';

                const questionNumberOverlay = document.createElement('div');
                questionNumberOverlay.className = 'question-number-overlay';
                questionNumberOverlay.textContent = imageObj.questionNumber || 'No Q#';
                
                imageWrapper.appendChild(img);
                imageWrapper.appendChild(questionNumberOverlay);
                imageGallery.appendChild(imageWrapper);
            });
        }
    };

    /**
     * Adds a new image object (data URL + question number) to local storage.
     * @param {string} dataUrl - The base64 data URL of the image.
     * @param {string} questionNumber - The question number for the image.
     */
    const addImageToStorage = (dataUrl, questionNumber) => {
        const images = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        images.push({ dataUrl, questionNumber });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
        updateGallery();
    };

    /**
     * Increments a question number, handling both numeric and alphanumeric formats.
     * For example, "1A" becomes "1B", "1" becomes "2".
     * @param {string} questionNumber - The question number to increment.
     * @returns {string} The new incremented question number.
     */
    const incrementQuestionNumber = (questionNumber) => {
        // If the question number is empty, start with '1'
        if (!questionNumber) {
            return '1';
        }

        // Check if the last character is a letter
        const lastChar = questionNumber.slice(-1);
        if (lastChar.match(/[A-Za-z]/)) {
            const prefix = questionNumber.slice(0, -1);
            const nextCharCode = lastChar.charCodeAt(0) + 1;
            // Handle wrap-around from 'Z' to 'A' or 'z' to 'a'
            if (nextCharCode > 90 && nextCharCode < 97) { // Check for uppercase Z
                return `${prefix}A`;
            }
            if (nextCharCode > 122) { // Check for lowercase z
                return `${prefix}a`;
            }
            return prefix + String.fromCharCode(nextCharCode);
        }

        // Check if the last part is a number
        const numMatch = questionNumber.match(/\d+$/);
        if (numMatch) {
            const num = parseInt(numMatch[0], 10);
            const prefix = questionNumber.substring(0, numMatch.index);
            return prefix + (num + 1);
        }
        
        // If no recognizable pattern, just append '1'
        return `${questionNumber}1`;
    };

    // --- Event Listeners ---

    // Handle the mode toggle switch
    modeToggle.addEventListener('change', () => {
        isSingleImageMode = modeToggle.checked;
        modeDisplay.textContent = isSingleImageMode ? 'Single Image Mode' : 'Bulk Mode';
    });

    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        let questionNumber = fileQuestionNumberInput.value.trim();
        fileCountParagraph.textContent = `${files.length} file(s) selected`;

        if (isSingleImageMode) {
            // Process files one by one to ensure the question number increments correctly
            let fileIndex = 0;
            const processFile = () => {
                if (fileIndex < files.length) {
                    const file = files[fileIndex];
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        addImageToStorage(event.target.result, questionNumber);
                        questionNumber = incrementQuestionNumber(questionNumber);
                        fileQuestionNumberInput.value = questionNumber;
                        fileIndex++;
                        processFile(); // Process the next file
                    };
                    reader.readAsDataURL(file);
                }
            };
            processFile();
        } else { // Bulk Mode
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    addImageToStorage(event.target.result, questionNumber);
                };
                reader.readAsDataURL(file);
            });
            fileQuestionNumberInput.value = '';
        }
    });

    // Handle camera start button click
    cameraStartButton.addEventListener('click', async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraStreamVideo.srcObject = cameraStream;
            cameraContainer.style.display = 'block';
            cameraStartButton.style.display = 'none';
            cameraCaptureButton.style.display = 'block';
        } catch (err) {
            console.error('Error accessing camera:', err);
            cameraErrorParagraph.textContent = 'Camera access denied or no camera found.';
            cameraErrorParagraph.style.display = 'block';
        }
    });

    // Handle camera capture button click
    cameraCaptureButton.addEventListener('click', () => {
        if (cameraStream) {
            let questionNumber = cameraQuestionNumberInput.value.trim();
            
            // Set canvas dimensions to match the video
            cameraCanvas.width = cameraStreamVideo.videoWidth;
            cameraCanvas.height = cameraStreamVideo.videoHeight;
            const context = cameraCanvas.getContext('2d');
            // Draw the current video frame onto the canvas
            context.drawImage(cameraStreamVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
            // Get the image data as a URL and save it
            const dataUrl = cameraCanvas.toDataURL('image/png');
            addImageToStorage(dataUrl, questionNumber);

            if (isSingleImageMode) {
                cameraQuestionNumberInput.value = incrementQuestionNumber(questionNumber);
            } else {
                cameraQuestionNumberInput.value = '';
            }
        }
    });

    // Handle clear images button click
    clearImagesButton.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        updateGallery();
    });

    // Initial load: update the gallery
    updateGallery();
});
