document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const questionButtonsContainer = document.getElementById('question-buttons-container');
    const emptyMessage = document.getElementById('empty-message');

    // --- Local Storage Key ---
    const STORAGE_KEY = 'savedImages';

    // --- Processing System ---
    const BUFFER_SIZE = 3;
    let questionStates = new Map(); // questionNumber -> state
    let processingBuffer = new Set(); // Set of question numbers currently in buffer
    let allQuestions = []; // Array of all question numbers

    // --- Rate Limiting ---
    const RATE_LIMIT_DELAY = 2000; // 2 seconds between API calls
    let lastAPICallTime = 0;
    let apiCallQueue = []; // Queue of pending API calls
    let isProcessingQueue = false;

    // States: 'unsolved', 'extracted', 'solving', 'solved'

    // --- API Configuration ---
    const API_KEY_STORAGE = 'together_api_key';
    const VISION_MODEL = 'meta-llama/Llama-Vision-Free';
    const TEXT_MODEL = 'lgai/exaone-deep-32b';
    const API_BASE_URL = 'https://api.together.xyz/v1/chat/completions';

    /**
     * Get API key from storage
     * @returns {string|null}
     */
    const getAPIKey = () => {
        return localStorage.getItem(API_KEY_STORAGE);
    };

    /**
     * Save API key to storage
     * @param {string} apiKey 
     */
    const saveAPIKey = (apiKey) => {
        localStorage.setItem(API_KEY_STORAGE, apiKey.trim());
    };

    /**
     * Update API status display
     * @param {string} message 
     * @param {string} type - 'success', 'error', or 'info'
     */
    const updateAPIStatus = (message, type = 'info') => {
        const statusElement = document.getElementById('api-status');
        const colors = {
            success: 'text-green-600',
            error: 'text-red-600',
            info: 'text-blue-600'
        };
        
        statusElement.className = `mt-2 text-sm ${colors[type]}`;
        statusElement.textContent = message;
    };

    /**
     * Initialize API key management
     */
    const initializeAPIKeyManagement = () => {
        const apiKeyInput = document.getElementById('api-key-input');
        const saveButton = document.getElementById('save-api-key-btn');
        
        // Load existing API key
        const existingKey = getAPIKey();
        if (existingKey) {
            apiKeyInput.value = existingKey;
            updateAPIStatus('✓ API key loaded from storage', 'success');
        }
        
        // Save button click handler
        saveButton.addEventListener('click', () => {
            const apiKey = apiKeyInput.value.trim();
            if (apiKey) {
                saveAPIKey(apiKey);
                updateAPIStatus('✓ API key saved successfully', 'success');
            } else {
                updateAPIStatus('⚠ Please enter a valid API key', 'error');
            }
        });
        
        // Enter key handler
        apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveButton.click();
            }
        });
    };

    // --- Data Storage ---
    let questionData = new Map(); // questionNumber -> { extractedText, solvedText }
    let questionModal = null; // Will be initialized when needed

    /**
     * Get all images for a specific question number
     * @param {string} questionNumber 
     * @returns {Array} Array of image objects
     */
    const getQuestionImages = (questionNumber) => {
        const images = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return images.filter(img => (img.questionNumber || 'No Q#') === questionNumber);
    };

    /**
     * Convert data URL to base64 format suitable for API
     * @param {string} dataUrl 
     * @returns {string}
     */
    const dataUrlToBase64 = (dataUrl) => {
        // Remove the data:image/[type];base64, prefix
        return dataUrl.split(',')[1];
    };

    /**
     * Rate-limited API call wrapper
     * @param {Function} apiCallFunction - Function that returns a Promise for the API call
     * @returns {Promise}
     */
    const rateLimitedAPICall = (apiCallFunction) => {
        return new Promise((resolve, reject) => {
            // Add to queue
            apiCallQueue.push({ apiCallFunction, resolve, reject });
            
            // Start processing queue if not already running
            if (!isProcessingQueue) {
                processAPIQueue();
            }
        });
    };

    /**
     * Process the API call queue with rate limiting
     */
    const processAPIQueue = async () => {
        if (isProcessingQueue || apiCallQueue.length === 0) {
            return;
        }

        isProcessingQueue = true;

        while (apiCallQueue.length > 0) {
            const currentTime = Date.now();
            const timeSinceLastCall = currentTime - lastAPICallTime;
            
            // Wait if we need to respect the rate limit
            if (timeSinceLastCall < RATE_LIMIT_DELAY) {
                const waitTime = RATE_LIMIT_DELAY - timeSinceLastCall;
                console.log(`Rate limiting: waiting ${waitTime}ms before next API call`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            // Get the next API call from queue
            const { apiCallFunction, resolve, reject } = apiCallQueue.shift();
            
            try {
                console.log(`Making API call (${apiCallQueue.length + 1} remaining in queue)`);
                const result = await apiCallFunction();
                lastAPICallTime = Date.now();
                resolve(result);
            } catch (error) {
                lastAPICallTime = Date.now();
                reject(error);
            }
        }

        isProcessingQueue = false;
    };

    /**
     * Make API call to Together AI (rate-limited)
     * @param {string} model 
     * @param {Array} messages 
     * @param {string} apiKey
     * @returns {Promise<string>}
     */
    const callTogetherAPI = async (model, messages, apiKey) => {
        const apiCallFunction = async () => {
            try {
                const response = await fetch(API_BASE_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        max_tokens: 4000,
                        temperature: 0.1
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`API call failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
                }

                const data = await response.json();
                
                if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                    throw new Error('Invalid response format from API');
                }
                
                return data.choices[0].message.content;
            } catch (error) {
                console.error('API call error:', error);
                throw error;
            }
        };

        // Use the rate-limited wrapper
        return rateLimitedAPICall(apiCallFunction);
    };

    /**
     * Extract function - uses LLM vision API to analyze images
     * @param {string} questionNumber 
     * @returns {Promise<string>}
     */
    const extract = async (questionNumber) => {
        console.log(`Starting extraction for ${questionNumber}`);
        
        try {
            // Get API key from storage
            const apiKey = getAPIKey();
            if (!apiKey) {
                throw new Error('Please configure your Together AI API key first');
            }

            // Get all images for this question
            const images = getQuestionImages(questionNumber);
            
            if (images.length === 0) {
                throw new Error(`No images found for question ${questionNumber}`);
            }

            // Prepare messages for vision model
            const messages = [{
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Please analyze this image and extract all the text, mathematical expressions, diagrams, and any other relevant content. Provide a detailed description of what you see in the image, including any questions, problems, or educational content. Be thorough and accurate in your extraction.`
                    },
                    ...images.map(img => ({
                        type: 'image_url',
                        image_url: {
                            url: img.dataUrl
                        }
                    }))
                ]
            }];

            const extractedText = await callTogetherAPI(VISION_MODEL, messages, apiKey);
            console.log(`Extraction completed for ${questionNumber}`);
            return extractedText;

        } catch (error) {
            console.error(`Error in extraction for ${questionNumber}:`, error);
            // Return fallback text in case of API failure
            return `Error extracting content for Question ${questionNumber}: ${error.message}. Please check your API configuration and try again.`;
        }
    };

    /**
     * Solve function - uses LLM to solve the extracted question
     * @param {string} questionNumber 
     * @param {string} extractedText 
     * @returns {Promise<string>}
     */
    const solve = async (questionNumber, extractedText) => {
        console.log(`Starting solving for ${questionNumber}`);
        
        try {
            // Get API key from storage
            const apiKey = getAPIKey();
            if (!apiKey) {
                throw new Error('Please configure your Together AI API key first');
            }

            const messages = [{
                role: 'user',
                content: `Please solve the following question step by step. Provide a detailed solution with clear explanations, calculations, and reasoning. If it's a mathematical problem, show all work. If it's a conceptual question, provide a comprehensive answer with relevant examples.

Question content extracted from image:
${extractedText}

Please provide a complete solution with:
1. Understanding of the problem
2. Step-by-step solution process
3. Final answer
4. Any additional explanations or context that might be helpful`
            }];

            const solvedText = await callTogetherAPI(TEXT_MODEL, messages, apiKey);
            console.log(`Solving completed for ${questionNumber}`);
            return solvedText;

        } catch (error) {
            console.error(`Error in solving for ${questionNumber}:`, error);
            // Return fallback text in case of API failure
            return `Error solving Question ${questionNumber}: ${error.message}. 

Original extracted content:
${extractedText}

Please check your API configuration and try again.`;
        }
    };

    /**
     * Updates the visual state of a question button
     * @param {string} questionNumber 
     * @param {string} state 
     */
    const updateButtonState = (questionNumber, state) => {
        const button = document.querySelector(`[data-question-number="${questionNumber}"]`);
        if (!button) return;

        // Remove all state classes
        button.classList.remove('unsolved', 'extracted', 'solving', 'solved');
        
        // Add current state class
        button.classList.add(state);

        // Update or create status indicator
        let statusIndicator = button.querySelector('.status-indicator');
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.className = 'status-indicator';
            button.appendChild(statusIndicator);
        }

        // Set status text
        const statusText = {
            'unsolved': 'UNSOLVED',
            'extracted': 'EXTRACTING',
            'solving': 'SOLVING',
            'solved': 'SOLVED'
        };
        
        statusIndicator.textContent = statusText[state] || 'UNKNOWN';
    };

    /**
     * Processes a single question through the pipeline
     * @param {string} questionNumber 
     */
    const processQuestion = async (questionNumber) => {
        try {
            console.log(`Added question ${questionNumber} to processing pipeline`);
            
            // Initialize question data
            questionData.set(questionNumber, { extractedText: null, solvedText: null });

            // Set state to extracted and update UI
            questionStates.set(questionNumber, 'extracted');
            updateButtonState(questionNumber, 'extracted');

            // Run extract function and store result (this will be rate-limited)
            const extractedText = await extract(questionNumber);
            const data = questionData.get(questionNumber);
            data.extractedText = extractedText;
            questionData.set(questionNumber, data);

            // Check if question is still in buffer (might have been cleared)
            if (!processingBuffer.has(questionNumber)) {
                console.log(`Question ${questionNumber} was removed from buffer during extraction`);
                return;
            }

            // Set state to solving and update UI
            questionStates.set(questionNumber, 'solving');
            updateButtonState(questionNumber, 'solving');

            // Run solve function with extracted text and store result (this will be rate-limited)
            const solvedText = await solve(questionNumber, extractedText);
            const updatedData = questionData.get(questionNumber);
            updatedData.solvedText = solvedText;
            questionData.set(questionNumber, updatedData);

            // Check if question is still in buffer
            if (!processingBuffer.has(questionNumber)) {
                console.log(`Question ${questionNumber} was removed from buffer during solving`);
                return;
            }

            // Set state to solved and update UI
            questionStates.set(questionNumber, 'solved');
            updateButtonState(questionNumber, 'solved');

            // Remove from buffer
            processingBuffer.delete(questionNumber);
            console.log(`Question ${questionNumber} completed and removed from buffer`);

            // Try to add next question to buffer
            fillBuffer();

        } catch (error) {
            console.error(`Error processing question ${questionNumber}:`, error);
            // On error, remove from buffer and try next question
            processingBuffer.delete(questionNumber);
            console.log(`Question ${questionNumber} removed from buffer due to error`);
            fillBuffer();
        }
    };

    /**
     * Fills the buffer with unsolved questions up to BUFFER_SIZE
     */
    const fillBuffer = () => {
        const bufferSpaceAvailable = BUFFER_SIZE - processingBuffer.size;
        
        if (bufferSpaceAvailable <= 0) {
            return; // Buffer is full
        }

        console.log(`Buffer has ${processingBuffer.size}/${BUFFER_SIZE} questions. Adding ${bufferSpaceAvailable} more.`);

        let added = 0;
        for (const questionNumber of allQuestions) {
            if (added >= bufferSpaceAvailable) break;
            
            if (questionStates.get(questionNumber) === 'unsolved') {
                // Add to buffer and start processing
                processingBuffer.add(questionNumber);
                console.log(`Added question ${questionNumber} to buffer (${processingBuffer.size}/${BUFFER_SIZE})`);
                
                // Start processing (the API calls will be automatically rate-limited)
                processQuestion(questionNumber);
                added++;
            }
        }

        if (added === 0) {
            console.log('No more unsolved questions to add to buffer');
        }
    };

    /**
     * Initializes the processing system
     */
    const initializeProcessing = () => {
        console.log('Initializing processing system...');
        
        // Reset all states
        questionStates.clear();
        processingBuffer.clear();
        apiCallQueue.length = 0; // Clear API queue
        isProcessingQueue = false;
        lastAPICallTime = 0;

        // Initialize all questions as unsolved
        allQuestions.forEach(questionNumber => {
            questionStates.set(questionNumber, 'unsolved');
            updateButtonState(questionNumber, 'unsolved');
        });

        console.log(`Found ${allQuestions.length} questions to process`);

        // Fill the buffer to start processing
        fillBuffer();
    };

    /**
     * Renders the buttons for each unique question number.
     */
    const renderQuestionButtons = () => {
        const images = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        questionButtonsContainer.innerHTML = ''; // Clear existing buttons

        if (images.length === 0) {
            emptyMessage.style.display = 'block';
            return;
        } else {
            emptyMessage.style.display = 'none';
        }

        // Group images by question number and find the first image for each group
        const uniqueQuestions = new Map();
        images.forEach(imageObj => {
            const questionNumber = imageObj.questionNumber || 'No Q#';
            if (!uniqueQuestions.has(questionNumber)) {
                uniqueQuestions.set(questionNumber, imageObj.dataUrl);
            }
        });

        // Update allQuestions array
        allQuestions = Array.from(uniqueQuestions.keys());

        // Create a button for each unique question
        uniqueQuestions.forEach((dataUrl, questionNumber) => {
            const button = document.createElement('button');
            button.className = 'question-button unsolved'; // Start with unsolved state
            button.setAttribute('data-question-number', questionNumber);

            const img = document.createElement('img');
            img.src = dataUrl;
            img.alt = `Preview for ${questionNumber}`;

            const span = document.createElement('span');
            span.textContent = questionNumber;

            button.appendChild(img);
            button.appendChild(span);
            questionButtonsContainer.appendChild(button);
        });

        // Initialize the processing system
        initializeProcessing();

        // Add click listener for buttons
        questionButtonsContainer.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.question-button');
            if (clickedButton) {
                const qNum = clickedButton.getAttribute('data-question-number');
                const state = questionStates.get(qNum);
                console.log(`Button for question "${qNum}" clicked. Current state: ${state}`);
                
                // Only show details for solved questions
                if (state === 'solved') {
                    showQuestionDetails(qNum);
                } else {
                    console.log(`Question ${qNum} is not yet solved. Current state: ${state}`);
                }
            }
        });
    };

    /**
     * Initialize the question modal
     */
    const initializeModal = () => {
        if (!questionModal) {
            questionModal = new QuestionModal();
        }
    };

    /**
     * Shows all images and processing results for a specific question
     * @param {string} questionNumber 
     */
    const showQuestionDetails = (questionNumber) => {
        const images = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const questionImages = images.filter(img => 
            (img.questionNumber || 'No Q#') === questionNumber
        );
        
        // Get processing data
        const data = questionData.get(questionNumber);
        const extractedText = data ? data.extractedText : null;
        const solvedText = data ? data.solvedText : null;
        
        console.log(`Showing details for question ${questionNumber}`);
        console.log(`Images: ${questionImages.length}, Extracted: ${!!extractedText}, Solved: ${!!solvedText}`);
        
        // Initialize modal if needed
        initializeModal();
        
        // Show modal with question details
        questionModal.show(questionNumber, questionImages, extractedText, solvedText);
    };

    // Add a reset button for testing purposes
    const addResetButton = () => {
        const container = document.querySelector('.bg-white.p-6');
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset Processing';
        resetButton.className = 'bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-full text-sm transition duration-300 ease-in-out shadow-lg transform hover:scale-105 absolute top-4 left-4';
        resetButton.onclick = () => {
            console.log('Resetting processing system...');
            // Clear processing state
            processingBuffer.clear();
            questionStates.clear();
            questionData.clear();
            apiCallQueue.length = 0;
            isProcessingQueue = false;
            lastAPICallTime = 0;
            
            // Restart processing
            initializeProcessing();
        };
        container.appendChild(resetButton);
    };

    // Initial load: render the buttons and initialize API key management
    renderQuestionButtons();
    addResetButton();
    initializeAPIKeyManagement();
});