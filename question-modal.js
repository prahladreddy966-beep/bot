/**
 * QuestionModal - A class to handle the question details modal
 */
class QuestionModal {
    constructor() {
        this.modal = null;
        this.isOpen = false;
        this.init();
    }

    /**
     * Initialize the modal HTML structure
     */
    init() {
        // Create modal HTML
        const modalHTML = `
            <div class="modal-overlay" id="question-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title" id="modal-question-title">Question Details</h2>
                        <button class="modal-close" id="modal-close-btn" aria-label="Close modal">×</button>
                    </div>
                    <div class="modal-body">
                        <div id="modal-images" class="modal-image-grid">
                            <!-- Images will be inserted here -->
                        </div>
                        
                        <div class="text-section" id="extracted-section" style="display: none;">
                            <h3 class="text-section-title">📄 Extracted Text</h3>
                            <div class="extracted-text" id="extracted-text-content">
                                <!-- Extracted text will be inserted here -->
                            </div>
                        </div>
                        
                        <div class="text-section" id="solved-section" style="display: none;">
                            <h3 class="text-section-title">✨ Solution</h3>
                            <div class="solved-text" id="solved-text-content">
                                <!-- Solved text will be inserted here -->
                            </div>
                        </div>
                        
                        <div class="empty-state" id="empty-state" style="display: none;">
                            <div class="empty-state-icon">📋</div>
                            <p>No processing data available for this question yet.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to the document
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('question-modal');

        // Add event listeners
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for modal interactions
     */
    setupEventListeners() {
        const closeBtn = document.getElementById('modal-close-btn');
        
        // Close button click
        closeBtn.addEventListener('click', () => this.close());

        // Overlay click to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    /**
     * Show the modal with question details
     * @param {string} questionNumber - The question number to display
     * @param {Array} images - Array of image objects for this question
     * @param {string|null} extractedText - The extracted text
     * @param {string|null} solvedText - The solved text
     */
    show(questionNumber, images, extractedText = null, solvedText = null) {
        // Update modal title
        document.getElementById('modal-question-title').textContent = `Question ${questionNumber}`;

        // Update images
        this.updateImages(images);

        // Update text sections
        this.updateTextSections(extractedText, solvedText);

        // Show modal
        this.modal.classList.add('active');
        this.isOpen = true;
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the modal
     */
    close() {
        this.modal.classList.remove('active');
        this.isOpen = false;
        
        // Restore body scroll
        document.body.style.overflow = '';
    }

    /**
     * Update the images section
     * @param {Array} images - Array of image objects
     */
    updateImages(images) {
        const imagesContainer = document.getElementById('modal-images');
        imagesContainer.innerHTML = '';

        if (images && images.length > 0) {
            images.forEach((imageObj, index) => {
                const imageItem = document.createElement('div');
                imageItem.className = 'modal-image-item';
                
                const img = document.createElement('img');
                img.src = imageObj.dataUrl;
                img.alt = `Question image ${index + 1}`;
                img.loading = 'lazy';
                
                imageItem.appendChild(img);
                imagesContainer.appendChild(imageItem);
            });
        }
    }

    /**
     * Update the text sections based on processing results
     * @param {string|null} extractedText - The extracted text
     * @param {string|null} solvedText - The solved text
     */
    updateTextSections(extractedText, solvedText) {
        const extractedSection = document.getElementById('extracted-section');
        const solvedSection = document.getElementById('solved-section');
        const emptyState = document.getElementById('empty-state');
        
        const extractedContent = document.getElementById('extracted-text-content');
        const solvedContent = document.getElementById('solved-text-content');

        // Show/hide sections based on available data
        if (extractedText || solvedText) {
            emptyState.style.display = 'none';
            
            if (extractedText) {
                extractedSection.style.display = 'block';
                extractedContent.textContent = extractedText;
            } else {
                extractedSection.style.display = 'none';
            }
            
            if (solvedText) {
                solvedSection.style.display = 'block';
                // Apply highlight effect to solved text
                solvedContent.innerHTML = `<span class="highlight-text">${this.escapeHtml(solvedText)}</span>`;
            } else {
                solvedSection.style.display = 'none';
            }
        } else {
            // Show empty state if no processing data
            extractedSection.style.display = 'none';
            solvedSection.style.display = 'none';
            emptyState.style.display = 'block';
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - The text to escape
     * @returns {string} - The escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Check if modal is currently open
     * @returns {boolean}
     */
    isModalOpen() {
        return this.isOpen;
    }
}

// Export for use in other modules (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuestionModal;
}