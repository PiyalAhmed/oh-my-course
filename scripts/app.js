// IndexedDB Helper for storing directory handles
class HandleDB {
    constructor() {
        this.dbName = 'CourseViewerDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('handles')) {
                    db.createObjectStore('handles', { keyPath: 'id' });
                }
            };
        });
    }

    async saveHandle(id, handle) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['handles'], 'readwrite');
            const store = transaction.objectStore('handles');
            const request = store.put({ id, handle });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getHandle(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['handles'], 'readonly');
            const store = transaction.objectStore('handles');
            const request = store.get(id);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.handle : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteHandle(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['handles'], 'readwrite');
            const store = transaction.objectStore('handles');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getAllHandles() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['handles'], 'readonly');
            const store = transaction.objectStore('handles');
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Neo-Brutalist Course Viewer Application
class CourseViewer {
    constructor() {
        this.directoryHandle = null;
        this.courseStructure = [];
        this.currentLesson = null;
        this.completedLessons = new Set();
        this.courseName = '';
        this.courseLibrary = new Map(); // Stores all loaded courses
        this.currentCourseId = null;
        this.videoProgress = {}; // Track video playback positions
        this.modalResolve = null; // For promise-based modal
        this.handleDB = new HandleDB(); // IndexedDB for directory handles
        this.shouldAutoPlay = false; // Flag to auto-play next video

        this.init();
    }

    // Custom Alert/Confirm Modal
    showModal(message, title = 'Alert', showCancel = false) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('modalOverlay');
            const modalTitle = document.getElementById('modalTitle');
            const modalMessage = document.getElementById('modalMessage');
            const confirmBtn = document.getElementById('modalConfirmBtn');
            const cancelBtn = document.getElementById('modalCancelBtn');

            modalTitle.textContent = title;
            modalMessage.textContent = message;

            if (showCancel) {
                cancelBtn.style.display = 'inline-flex';
            } else {
                cancelBtn.style.display = 'none';
            }

            overlay.style.display = 'flex';

            const handleConfirm = () => {
                overlay.style.display = 'none';
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                resolve(true);
            };

            const handleCancel = () => {
                overlay.style.display = 'none';
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                resolve(false);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    handleCancel();
                }
            });
        });
    }

    async init() {
        // Initialize IndexedDB
        await this.handleDB.init();

        // Request persistent storage
        await this.requestPersistentStorage();

        this.loadCourseLibrary();
        this.loadLastSession();
        this.attachEventListeners();
        this.renderHomepage();
    }

    async requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            if (isPersisted) {
                console.log('Storage will not be cleared except by explicit user action');
            } else {
                console.log('Storage may be cleared by the browser under storage pressure');
            }
        }
    }

    attachEventListeners() {
        // Home button - go back to homepage
        document.getElementById('homeBtn').addEventListener('click', () => this.goHome());

        // Folder selection - header button opens course directly
        document.getElementById('selectFolderBtn').addEventListener('click', () => this.openCourse());
        // Get started button adds course to library
        document.getElementById('getStartedBtn').addEventListener('click', () => this.addCourse());

        // Lesson navigation
        document.getElementById('markCompleteBtn').addEventListener('click', () => this.toggleLessonComplete());
        document.getElementById('prevLessonBtn').addEventListener('click', () => this.navigateLesson(-1));
        document.getElementById('nextLessonBtn').addEventListener('click', () => this.navigateLesson(1));
    }

    async openCourse() {
        try {
            // Check if File System Access API is supported
            if (!('showDirectoryPicker' in window)) {
                await this.showModal('Your browser does not support the File System Access API. Please use Chrome, Edge, or another compatible browser.', 'Browser Not Supported');
                return;
            }

            this.directoryHandle = await window.showDirectoryPicker();
            await this.loadCourse(true); // true = open immediately
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting folder:', error);
                await this.showModal('Error accessing folder. Please try again.', 'Error');
            }
        }
    }

    async addCourse() {
        try {
            // Check if File System Access API is supported
            if (!('showDirectoryPicker' in window)) {
                await this.showModal('Your browser does not support the File System Access API. Please use Chrome, Edge, or another compatible browser.', 'Browser Not Supported');
                return;
            }

            this.directoryHandle = await window.showDirectoryPicker();
            await this.loadCourse(false); // false = add to library only
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting folder:', error);
                await this.showModal('Error accessing folder. Please try again.', 'Error');
            }
        }
    }

    async loadCourse(shouldOpen = true) {
        try {
            this.courseName = this.directoryHandle.name;
            this.currentCourseId = this.generateCourseId(this.courseName);
            this.courseStructure = await this.parseCourseStructure(this.directoryHandle);

            // Load progress for this course
            this.loadCourseProgress(this.currentCourseId);

            // Save directory handle to IndexedDB
            await this.handleDB.saveHandle(this.currentCourseId, this.directoryHandle);

            // Save directory handle to course library
            this.courseLibrary.set(this.currentCourseId, {
                name: this.courseName,
                handle: this.directoryHandle,
                addedDate: Date.now(),
                lastAccessed: Date.now()
            });
            this.saveCourseLibrary();

            if (shouldOpen) {
                // Open the course
                this.renderCourseNavigation();
                this.updateProgressBar();
                this.showLessonContent();

                // Hide welcome screen, show content and sidebar, hide add button
                document.getElementById('welcomeScreen').style.display = 'none';
                document.getElementById('lessonContent').style.display = 'flex';
                document.getElementById('sidebar').classList.remove('hidden');
                document.getElementById('selectFolderBtn').classList.add('hidden');
            } else {
                // Just add to library, stay on homepage
                this.renderHomepage();
                await this.showModal(`Course "${this.courseName}" has been added to your library!`, 'Course Added');
            }
        } catch (error) {
            console.error('Error loading course:', error);
            await this.showModal('Error loading course structure. Please ensure the folder contains valid course content.', 'Error');
        }
    }

    async parseCourseStructure(dirHandle) {
        const structure = [];
        const entries = [];

        // Collect all entries
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory') {
                entries.push(entry);
            }
        }

        // Validate: must have directories (sections)
        if (entries.length === 0) {
            throw new Error('No sections found. Course folder must contain numbered section folders.');
        }

        // Sort directories by name (which includes numbers)
        entries.sort((a, b) => this.naturalSort(a.name, b.name));

        let totalVideosFound = 0;

        // Parse each section
        for (const entry of entries) {
            const section = {
                name: this.cleanSectionName(entry.name),
                rawName: entry.name,
                lessons: [],
                hasNonVideoFiles: false
            };

            // Get lessons in this section
            const lessonEntries = [];
            for await (const lessonEntry of entry.values()) {
                if (lessonEntry.kind === 'file') {
                    lessonEntries.push(lessonEntry);
                }
            }

            // Sort lessons
            lessonEntries.sort((a, b) => this.naturalSort(a.name, b.name));

            // Group lessons by number (video + subtitle only)
            const lessonGroups = new Map();
            const nonVideoFiles = [];

            for (const lessonEntry of lessonEntries) {
                const lessonNumber = this.extractLessonNumber(lessonEntry.name);
                const fileType = this.getFileType(lessonEntry.name);

                // Only process video and subtitle files
                if (fileType === 'video' || fileType === 'subtitle') {
                    if (!lessonGroups.has(lessonNumber)) {
                        lessonGroups.set(lessonNumber, {
                            number: lessonNumber,
                            name: this.cleanLessonName(lessonEntry.name),
                            files: []
                        });
                    }

                    lessonGroups.get(lessonNumber).files.push({
                        handle: lessonEntry,
                        name: lessonEntry.name,
                        type: fileType
                    });

                    if (fileType === 'video') {
                        totalVideosFound++;
                    }
                } else {
                    // Track non-video files
                    nonVideoFiles.push(lessonEntry.name);
                }
            }

            // Only include lessons that have videos
            const videoLessons = Array.from(lessonGroups.values())
                .filter(lesson => lesson.files.some(f => f.type === 'video'))
                .sort((a, b) => this.naturalSort(a.number, b.number));

            section.lessons = videoLessons;
            section.hasNonVideoFiles = nonVideoFiles.length > 0;

            // Only add section if it has video lessons
            if (section.lessons.length > 0) {
                structure.push(section);
            }
        }

        // Validate: must have at least one video
        if (totalVideosFound === 0) {
            throw new Error('No video files found. Course folder must contain video lessons.');
        }

        // Validate: must have valid course structure
        if (structure.length === 0) {
            throw new Error('Invalid course format. No valid sections with videos found.');
        }

        return structure;
    }

    generateCourseId(courseName) {
        // Generate a simple hash-like ID from course name
        return courseName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    extractLessonNumber(filename) {
        const match = filename.match(/^(\d+)\./);
        return match ? match[1] : '0';
    }

    cleanSectionName(name) {
        // Remove leading numbers and dots
        return name.replace(/^\d+\.\s*/, '');
    }

    cleanLessonName(filename) {
        // Remove leading numbers, file extension, and clean up
        return filename
            .replace(/^\d+\.\s*/, '')
            .replace(/\.(mp4|pdf|html|txt|vtt|zip|odp)$/i, '')
            .trim();
    }

    getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const typeMap = {
            'mp4': 'video',
            'vtt': 'subtitle',
            'pdf': 'pdf',
            'html': 'html',
            'txt': 'text',
            'zip': 'archive',
            'odp': 'presentation'
        };
        return typeMap[ext] || 'file';
    }

    naturalSort(a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }

    renderCourseNavigation() {
        const courseTitle = document.getElementById('courseTitle');
        const courseNav = document.getElementById('courseNav');

        courseTitle.textContent = this.courseName;
        courseNav.innerHTML = '';

        this.courseStructure.forEach((section, sectionIndex) => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'section';

            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'section-header';
            sectionHeader.innerHTML = `
                <span>${section.name}</span>
                <span class="section-toggle">▼</span>
            `;

            sectionHeader.addEventListener('click', () => {
                sectionEl.classList.toggle('collapsed');
            });

            const lessonsContainer = document.createElement('div');
            lessonsContainer.className = 'section-lessons';

            // Add non-video files indicator if present
            if (section.hasNonVideoFiles) {
                const indicator = document.createElement('div');
                indicator.className = 'non-video-indicator';
                indicator.innerHTML = `
                    <span class="indicator-icon">📂</span>
                    <span class="indicator-text">This section contains additional resources (PDFs, documents, etc.). Open the course folder locally to access them.</span>
                `;
                lessonsContainer.appendChild(indicator);
            }

            section.lessons.forEach((lesson, lessonIndex) => {
                const lessonId = `${sectionIndex}-${lessonIndex}`;
                const isCompleted = this.completedLessons.has(lessonId);

                const lessonEl = document.createElement('div');
                lessonEl.className = `lesson-item ${isCompleted ? 'completed' : ''}`;
                lessonEl.dataset.sectionIndex = sectionIndex;
                lessonEl.dataset.lessonIndex = lessonIndex;

                // All lessons are videos now
                const icon = '🎥';

                lessonEl.innerHTML = `
                    <div class="lesson-checkbox"></div>
                    <span class="lesson-icon">${icon}</span>
                    <span class="lesson-name">${lesson.name}</span>
                `;

                lessonEl.addEventListener('click', () => {
                    this.loadLesson(sectionIndex, lessonIndex);
                });

                lessonsContainer.appendChild(lessonEl);
            });

            sectionEl.appendChild(sectionHeader);
            sectionEl.appendChild(lessonsContainer);
            courseNav.appendChild(sectionEl);
        });
    }

    getIconForType(type) {
        const icons = {
            'video': '🎥',
            'pdf': '📄',
            'html': '📝',
            'text': '📄',
            'archive': '📦',
            'presentation': '📊',
            'file': '📎'
        };
        return icons[type] || icons['file'];
    }

    setupMobileControls() {
        const mobileMarkCompleteBtn = document.getElementById('mobileMarkCompleteBtn');
        const mobilePrevBtn = document.getElementById('mobilePrevBtn');
        const mobileNextBtn = document.getElementById('mobileNextBtn');

        if (!mobileMarkCompleteBtn || !mobilePrevBtn || !mobileNextBtn) return;

        // Update button states based on current lesson
        const lessonId = `${this.currentLesson.sectionIndex}-${this.currentLesson.lessonIndex}`;
        const isCompleted = this.completedLessons.has(lessonId);

        if (isCompleted) {
            mobileMarkCompleteBtn.classList.add('completed');
            document.getElementById('mobileCompleteText').textContent = 'Completed';
        } else {
            mobileMarkCompleteBtn.classList.remove('completed');
            document.getElementById('mobileCompleteText').textContent = 'Mark as Complete';
        }

        // Mobile mark complete button
        mobileMarkCompleteBtn.addEventListener('click', () => {
            this.toggleLessonComplete();
            // Update mobile button text
            const lessonId = `${this.currentLesson.sectionIndex}-${this.currentLesson.lessonIndex}`;
            if (this.completedLessons.has(lessonId)) {
                mobileMarkCompleteBtn.classList.add('completed');
                document.getElementById('mobileCompleteText').textContent = 'Completed';
            } else {
                mobileMarkCompleteBtn.classList.remove('completed');
                document.getElementById('mobileCompleteText').textContent = 'Mark as Complete';
            }
        });

        // Mobile navigation buttons
        mobilePrevBtn.addEventListener('click', () => this.navigateLesson(-1));
        mobileNextBtn.addEventListener('click', () => this.navigateLesson(1));

        // Update button states
        this.updateMobileNavigationButtons();
    }

    updateMobileNavigationButtons() {
        const mobilePrevBtn = document.getElementById('mobilePrevBtn');
        const mobileNextBtn = document.getElementById('mobileNextBtn');

        if (!mobilePrevBtn || !mobileNextBtn || !this.currentLesson) return;

        const { sectionIndex, lessonIndex } = this.currentLesson;

        // Check if there's a previous lesson
        const hasPrev = sectionIndex > 0 || lessonIndex > 0;
        mobilePrevBtn.disabled = !hasPrev;

        // Check if there's a next lesson
        const hasNext = sectionIndex < this.courseStructure.length - 1 ||
                       lessonIndex < this.courseStructure[sectionIndex].lessons.length - 1;
        mobileNextBtn.disabled = !hasNext;
    }

    renderMobileCourseNav() {
        const mobileCourseNav = document.getElementById('mobileCourseNav');
        if (!mobileCourseNav) return;

        mobileCourseNav.innerHTML = '';

        // Add course title
        const titleEl = document.createElement('h3');
        titleEl.style.cssText = 'font-size: 1rem; font-weight: 700; margin-bottom: 1rem; color: var(--spotify-white);';
        titleEl.textContent = this.courseName;
        mobileCourseNav.appendChild(titleEl);

        // Render sections and lessons
        this.courseStructure.forEach((section, sectionIndex) => {
            const sectionEl = document.createElement('div');
            sectionEl.style.marginBottom = '1rem';

            const sectionHeader = document.createElement('div');
            sectionHeader.style.cssText = 'padding: 0.75rem; background: var(--spotify-base); border-radius: 4px; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--spotify-gray); cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
            sectionHeader.innerHTML = `
                <span>${section.name}</span>
                <span class="mobile-section-toggle">▼</span>
            `;

            const lessonsContainer = document.createElement('div');
            lessonsContainer.className = 'mobile-section-lessons';
            lessonsContainer.style.cssText = 'margin-top: 0.5rem; display: block;';

            // Add non-video files indicator if present
            if (section.hasNonVideoFiles) {
                const indicator = document.createElement('div');
                indicator.style.cssText = 'padding: 0.75rem; margin: 0.5rem 0; background: rgba(29, 185, 84, 0.1); border-left: 3px solid var(--spotify-green); border-radius: 4px; display: flex; align-items: flex-start; gap: 0.75rem; font-size: 0.75rem; line-height: 1.4;';
                indicator.innerHTML = `
                    <span style="font-size: 1rem; flex-shrink: 0;">📂</span>
                    <span style="color: var(--spotify-gray); flex: 1;">This section contains additional resources (PDFs, documents, etc.). Open the course folder locally to access them.</span>
                `;
                lessonsContainer.appendChild(indicator);
            }

            section.lessons.forEach((lesson, lessonIndex) => {
                const lessonId = `${sectionIndex}-${lessonIndex}`;
                const isCompleted = this.completedLessons.has(lessonId);
                const isActive = this.currentLesson &&
                                this.currentLesson.sectionIndex === sectionIndex &&
                                this.currentLesson.lessonIndex === lessonIndex;

                const lessonEl = document.createElement('div');
                lessonEl.style.cssText = `padding: 0.75rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; color: ${isActive ? 'var(--spotify-white)' : 'var(--spotify-gray)'}; background: ${isActive ? 'var(--spotify-base)' : 'transparent'}; border-radius: 4px; margin-bottom: 0.25rem; font-weight: ${isActive ? '600' : '400'};`;

                const checkbox = document.createElement('div');
                checkbox.style.cssText = `width: 18px; height: 18px; border: 2px solid ${isCompleted ? 'var(--spotify-green)' : 'var(--spotify-subdued)'}; border-radius: 4px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: ${isCompleted ? 'var(--spotify-green)' : 'transparent'};`;
                if (isCompleted) {
                    checkbox.innerHTML = '<span style="color: var(--spotify-black); font-size: 0.7rem; font-weight: 900;">✓</span>';
                }

                const icon = document.createElement('span');
                icon.textContent = '🎥';
                icon.style.cssText = 'font-size: 1.1rem; opacity: 0.7;';

                const name = document.createElement('span');
                name.textContent = lesson.name;
                name.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

                lessonEl.appendChild(checkbox);
                lessonEl.appendChild(icon);
                lessonEl.appendChild(name);

                lessonEl.addEventListener('click', () => {
                    this.loadLesson(sectionIndex, lessonIndex);
                });

                lessonsContainer.appendChild(lessonEl);
            });

            sectionHeader.addEventListener('click', () => {
                const toggle = sectionHeader.querySelector('.mobile-section-toggle');
                if (lessonsContainer.style.display === 'none') {
                    lessonsContainer.style.display = 'block';
                    toggle.textContent = '▼';
                } else {
                    lessonsContainer.style.display = 'none';
                    toggle.textContent = '▶';
                }
            });

            sectionEl.appendChild(sectionHeader);
            sectionEl.appendChild(lessonsContainer);
            mobileCourseNav.appendChild(sectionEl);
        });
    }

    async loadLesson(sectionIndex, lessonIndex) {
        const section = this.courseStructure[sectionIndex];
        const lesson = section.lessons[lessonIndex];

        this.currentLesson = { sectionIndex, lessonIndex };

        // Save last viewed lesson
        this.saveLastSession();

        // Update active state
        document.querySelectorAll('.lesson-item').forEach(el => el.classList.remove('active'));
        const lessonEl = document.querySelector(`[data-section-index="${sectionIndex}"][data-lesson-index="${lessonIndex}"]`);
        if (lessonEl) lessonEl.classList.add('active');

        // Update lesson title
        document.getElementById('lessonTitle').textContent = lesson.name;

        // Update complete button
        const lessonId = `${sectionIndex}-${lessonIndex}`;
        const markCompleteBtn = document.getElementById('markCompleteBtn');
        if (this.completedLessons.has(lessonId)) {
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                COMPLETED
            `;
        } else {
            markCompleteBtn.classList.remove('completed');
            markCompleteBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                MARK COMPLETE
            `;
        }

        // Update navigation buttons
        this.updateNavigationButtons();

        // Load content
        await this.renderLessonContent(lesson);
    }

    async renderLessonContent(lesson) {
        const lessonBody = document.getElementById('lessonBody');
        lessonBody.innerHTML = '<div class="loading"></div>';

        try {
            // Only process video files (subtitles are included automatically)
            const videoFile = lesson.files.find(f => f.type === 'video');
            const subtitleFile = lesson.files.find(f => f.type === 'subtitle');

            if (videoFile) {
                // Video player
                const videoUrl = URL.createObjectURL(await videoFile.handle.getFile());
                const lessonId = `${this.currentLesson.sectionIndex}-${this.currentLesson.lessonIndex}`;
                const savedTime = this.videoProgress[this.currentCourseId]?.[lessonId] || 0;

                const content = `
                    <!-- Shared Video Player -->
                    <div class="video-wrapper-shared">
                        <div class="video-container">
                            <video controls id="videoPlayer">
                                <source src="${videoUrl}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                            <div class="video-end-overlay" id="videoEndOverlay" style="display: none;">
                                <div class="video-end-content">
                                    <div class="video-end-icon">✓</div>
                                    <h3>Video Complete!</h3>
                                    <div class="video-end-actions">
                                        <button class="btn-primary" id="markCompleteNextBtn">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                            Mark Complete & Next
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Mobile Lesson Title and Controls -->
                    <div class="mobile-lesson-title" id="mobileLessonTitle">${lesson.name}</div>
                    <div class="mobile-video-controls">
                        <button id="mobileMarkCompleteBtn" class="btn-complete">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span id="mobileCompleteText">Mark as Complete</span>
                        </button>
                        <div class="mobile-nav-buttons">
                            <button id="mobilePrevBtn" class="btn-nav">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                                Previous
                            </button>
                            <button id="mobileNextBtn" class="btn-nav">
                                Next
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Mobile Course Navigation -->
                    <div class="mobile-course-nav" id="mobileCourseNav"></div>
                `;

                lessonBody.innerHTML = content;

                // Render mobile course navigation (only visible on mobile)
                this.renderMobileCourseNav();

                // Setup mobile navigation buttons
                this.setupMobileControls();

                // Setup single shared video player
                const videoPlayer = document.getElementById('videoPlayer');
                const videoEndOverlay = document.getElementById('videoEndOverlay');
                const markCompleteNextBtn = document.getElementById('markCompleteNextBtn');

                // Prepare subtitle URL if available
                let subtitleUrl = null;
                if (subtitleFile) {
                    subtitleUrl = URL.createObjectURL(await subtitleFile.handle.getFile());
                }

                if (videoPlayer) {
                    // Restore video position (but not if already completed)
                    if (savedTime > 0) {
                        videoPlayer.addEventListener('loadedmetadata', () => {
                            if (savedTime < videoPlayer.duration - 5) {
                                videoPlayer.currentTime = savedTime;
                            }
                        }, { once: true });
                    }

                    // Save video progress periodically
                    videoPlayer.addEventListener('timeupdate', () => {
                        if (!this.videoProgress[this.currentCourseId]) {
                            this.videoProgress[this.currentCourseId] = {};
                        }
                        this.videoProgress[this.currentCourseId][lessonId] = videoPlayer.currentTime;
                        this.saveVideoProgress();
                    });

                    // Handle video end
                    videoPlayer.addEventListener('ended', () => {
                        this.handleVideoEnd();
                    });

                    // Add subtitles if available
                    if (subtitleUrl) {
                        const track = document.createElement('track');
                        track.kind = 'subtitles';
                        track.label = 'English';
                        track.srclang = 'en';
                        track.src = subtitleUrl;
                        track.default = true;
                        videoPlayer.appendChild(track);
                    }

                    // Auto-play if flag is set
                    if (this.shouldAutoPlay) {
                        setTimeout(() => {
                            videoPlayer.play().catch(err => {
                                console.log('Auto-play prevented by browser:', err);
                            });
                        }, 100);
                    }
                }

                // Reset auto-play flag after setup
                this.shouldAutoPlay = false;

                // Mark complete & next button
                if (markCompleteNextBtn) {
                    markCompleteNextBtn.addEventListener('click', () => {
                        this.markCompleteAndNext();
                    });
                }
            } else {
                // No video found (should not happen due to validation)
                lessonBody.innerHTML = `
                    <div class="empty-state">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M23 7l-7 5 7 5V7z"></path>
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                        </svg>
                        <p>No video found for this lesson</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error rendering lesson content:', error);
            lessonBody.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p>Error loading lesson content</p>
                </div>
            `;
        }
    }

    handleVideoEnd() {
        const videoEndOverlay = document.getElementById('videoEndOverlay');

        if (!videoEndOverlay) return;

        videoEndOverlay.style.display = 'flex';
    }

    markCompleteAndNext() {
        // Mark current lesson as complete
        if (this.currentLesson) {
            const { sectionIndex, lessonIndex } = this.currentLesson;
            const lessonId = `${sectionIndex}-${lessonIndex}`;

            if (!this.completedLessons.has(lessonId)) {
                this.completedLessons.add(lessonId);
                this.saveCourseProgress(this.currentCourseId);
                this.updateProgressBar();

                // Update UI
                const lessonEl = document.querySelector(`[data-section-index="${sectionIndex}"][data-lesson-index="${lessonIndex}"]`);
                if (lessonEl) {
                    lessonEl.classList.add('completed');
                }
            }
        }

        // Set flag to auto-play next video
        this.shouldAutoPlay = true;

        // Navigate to next lesson
        this.navigateLesson(1);
    }

    async renderPDF(pdfFile) {
        try {
            const fileData = await pdfFile.handle.getFile();
            const arrayBuffer = await fileData.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let currentPage = 1;

            const renderPage = async (pageNum) => {
                const page = await pdf.getPage(pageNum);
                const canvas = document.getElementById('pdfCanvas');
                const context = canvas.getContext('2d');

                const viewport = page.getViewport({ scale: 1.5 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                document.getElementById('pdfPageInfo').textContent = `Page ${pageNum} of ${pdf.numPages}`;
                document.getElementById('pdfPrev').disabled = pageNum === 1;
                document.getElementById('pdfNext').disabled = pageNum === pdf.numPages;
            };

            await renderPage(currentPage);

            document.getElementById('pdfPrev').onclick = async () => {
                if (currentPage > 1) {
                    currentPage--;
                    await renderPage(currentPage);
                }
            };

            document.getElementById('pdfNext').onclick = async () => {
                if (currentPage < pdf.numPages) {
                    currentPage++;
                    await renderPage(currentPage);
                }
            };

        } catch (error) {
            console.error('Error rendering PDF:', error);
        }
    }

    async downloadFile(fileName) {
        const { sectionIndex, lessonIndex } = this.currentLesson;
        const lesson = this.courseStructure[sectionIndex].lessons[lessonIndex];
        const file = lesson.files.find(f => f.name === fileName);

        if (file) {
            const fileData = await file.handle.getFile();
            const url = URL.createObjectURL(fileData);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        }
    }

    toggleLessonComplete() {
        if (!this.currentLesson) return;

        const { sectionIndex, lessonIndex } = this.currentLesson;
        const lessonId = `${sectionIndex}-${lessonIndex}`;

        if (this.completedLessons.has(lessonId)) {
            this.completedLessons.delete(lessonId);
        } else {
            this.completedLessons.add(lessonId);
        }

        this.saveCourseProgress(this.currentCourseId);
        this.updateProgressBar();

        // Update UI
        const lessonEl = document.querySelector(`[data-section-index="${sectionIndex}"][data-lesson-index="${lessonIndex}"]`);
        if (lessonEl) {
            lessonEl.classList.toggle('completed');
        }

        // Update button
        const markCompleteBtn = document.getElementById('markCompleteBtn');
        if (this.completedLessons.has(lessonId)) {
            markCompleteBtn.classList.add('completed');
            markCompleteBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                COMPLETED
            `;
        } else {
            markCompleteBtn.classList.remove('completed');
            markCompleteBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                MARK COMPLETE
            `;
        }
    }

    navigateLesson(direction) {
        if (!this.currentLesson) return;

        const { sectionIndex, lessonIndex } = this.currentLesson;
        let newSectionIndex = sectionIndex;
        let newLessonIndex = lessonIndex + direction;

        // Check if we need to move to a different section
        if (newLessonIndex < 0) {
            // Move to previous section
            if (newSectionIndex > 0) {
                newSectionIndex--;
                newLessonIndex = this.courseStructure[newSectionIndex].lessons.length - 1;
            } else {
                return; // Already at the first lesson
            }
        } else if (newLessonIndex >= this.courseStructure[newSectionIndex].lessons.length) {
            // Move to next section
            if (newSectionIndex < this.courseStructure.length - 1) {
                newSectionIndex++;
                newLessonIndex = 0;
            } else {
                return; // Already at the last lesson
            }
        }

        this.loadLesson(newSectionIndex, newLessonIndex);
    }

    updateNavigationButtons() {
        if (!this.currentLesson) return;

        const { sectionIndex, lessonIndex } = this.currentLesson;
        const prevBtn = document.getElementById('prevLessonBtn');
        const nextBtn = document.getElementById('nextLessonBtn');

        // Check if there's a previous lesson
        const hasPrev = sectionIndex > 0 || lessonIndex > 0;
        prevBtn.disabled = !hasPrev;

        // Check if there's a next lesson
        const hasNext = sectionIndex < this.courseStructure.length - 1 ||
                       lessonIndex < this.courseStructure[sectionIndex].lessons.length - 1;
        nextBtn.disabled = !hasNext;
    }

    updateProgressBar() {
        const totalLessons = this.courseStructure.reduce((sum, section) =>
            sum + section.lessons.length, 0);

        const completedCount = this.completedLessons.size;
        const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

        document.getElementById('progressBar').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = `${percentage}% (${completedCount}/${totalLessons})`;
    }

    // Homepage and Course Library Management
    goHome() {
        // Show welcome screen, hide lesson content and sidebar, show add button
        document.getElementById('welcomeScreen').style.display = 'flex';
        document.getElementById('lessonContent').style.display = 'none';
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('selectFolderBtn').classList.remove('hidden');

        this.renderHomepage();
    }

    renderHomepage() {
        const courseLibrary = document.getElementById('courseLibrary');
        const courseGrid = document.getElementById('courseGrid');
        const emptyLibraryMessage = document.getElementById('emptyLibraryMessage');

        if (this.courseLibrary.size === 0) {
            courseLibrary.style.display = 'none';
            emptyLibraryMessage.style.display = 'block';
            return;
        }

        courseLibrary.style.display = 'block';
        emptyLibraryMessage.style.display = 'none';
        courseGrid.innerHTML = '';

        // Convert to array and sort by last accessed
        const courses = Array.from(this.courseLibrary.entries())
            .sort((a, b) => b[1].lastAccessed - a[1].lastAccessed);

        courses.forEach(([courseId, courseData]) => {
            const progress = this.getCourseProgress(courseId);
            const lastLesson = this.getLastViewedLesson(courseId);

            const card = document.createElement('div');
            card.className = 'course-card';
            if (courseId === this.currentCourseId) {
                card.classList.add('active');
            }

            card.innerHTML = `
                <div class="course-card-header">
                    <h3>${courseData.name}</h3>
                </div>
                <div class="course-card-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress.percentage}%"></div>
                    </div>
                    <p style="margin-top: 0.5rem; font-weight: 700;">${progress.percentage}% Complete</p>
                </div>
                <div class="course-card-footer">
                    <span class="course-last-watched">${lastLesson || 'Not started'}</span>
                    <button class="btn-delete" onclick="courseViewer.deleteCourse('${courseId}', event)">DELETE</button>
                </div>
            `;

            card.addEventListener('click', async (e) => {
                if (e.target.classList.contains('btn-delete')) return;
                await this.loadCourseFromLibrary(courseId);
            });

            courseGrid.appendChild(card);
        });
    }

    getCourseProgress(courseId) {
        const progressData = localStorage.getItem(`course_progress_${courseId}`);
        if (!progressData) {
            return { percentage: 0, completed: 0, total: 0 };
        }

        const data = JSON.parse(progressData);
        return {
            percentage: data.percentage || 0,
            completed: data.completedCount || 0,
            total: data.totalLessons || 0
        };
    }

    getLastViewedLesson(courseId) {
        const sessionData = localStorage.getItem(`last_session_${courseId}`);
        if (!sessionData) return null;

        const data = JSON.parse(sessionData);
        return data.lessonName || null;
    }

    async loadCourseFromLibrary(courseId) {
        const courseData = this.courseLibrary.get(courseId);
        if (!courseData) return;

        try {
            // Try to get handle from IndexedDB first
            let handle = await this.handleDB.getHandle(courseId);

            if (handle) {
                // We have a stored handle, verify we can still access it
                try {
                    const permission = await handle.queryPermission({ mode: 'read' });

                    if (permission !== 'granted') {
                        const newPermission = await handle.requestPermission({ mode: 'read' });
                        if (newPermission !== 'granted') {
                            await this.showModal('Permission denied to access this course folder.', 'Permission Denied');
                            return;
                        }
                    }

                    // Verify the handle still works by trying to iterate
                    await handle.values().next();
                    this.directoryHandle = handle;
                    courseData.handle = handle;

                } catch (error) {
                    // Handle is stale or inaccessible, need to request folder again
                    console.log('Stored handle is stale, requesting folder selection');
                    handle = null;
                }
            }

            // If we don't have a valid handle, request the folder
            if (!handle) {
                await this.showModal(
                    `Please select the course folder:\n"${courseData.name}"`,
                    'Select Course Folder'
                );

                this.directoryHandle = await window.showDirectoryPicker();

                // Verify it's the same course by checking the name
                if (this.directoryHandle.name !== courseData.name) {
                    await this.showModal(
                        `The selected folder "${this.directoryHandle.name}" does not match the course:\n"${courseData.name}"\n\nPlease select the correct folder.`,
                        'Wrong Folder'
                    );
                    return;
                }

                // Save the new handle to IndexedDB
                await this.handleDB.saveHandle(courseId, this.directoryHandle);
                courseData.handle = this.directoryHandle;
            }

            this.courseName = courseData.name;
            this.currentCourseId = courseId;

            // Update last accessed
            courseData.lastAccessed = Date.now();
            this.saveCourseLibrary();

            this.courseStructure = await this.parseCourseStructure(this.directoryHandle);
            this.loadCourseProgress(courseId);

            this.renderCourseNavigation();
            this.updateProgressBar();

            // Load last viewed lesson or first lesson
            const lastSession = this.loadLastSessionForCourse(courseId);
            if (lastSession && lastSession.sectionIndex !== undefined && lastSession.lessonIndex !== undefined) {
                await this.loadLesson(lastSession.sectionIndex, lastSession.lessonIndex);
            } else {
                this.showLessonContent();
            }

            // Show course view, hide sidebar hidden class, hide add button
            document.getElementById('welcomeScreen').style.display = 'none';
            document.getElementById('lessonContent').style.display = 'flex';
            document.getElementById('sidebar').classList.remove('hidden');
            document.getElementById('selectFolderBtn').classList.add('hidden');

        } catch (error) {
            if (error.name === 'AbortError') {
                // User cancelled the folder selection
                return;
            }

            console.error('Error loading course from library:', error);
            await this.showModal('Error loading course. The folder may have been moved or deleted.', 'Error');
            this.courseLibrary.delete(courseId);
            this.saveCourseLibrary();
            this.renderHomepage();
        }
    }

    async deleteCourse(courseId, event) {
        event.stopPropagation();

        const confirmed = await this.showModal(
            'Are you sure you want to remove this course from your library? All progress will be lost.',
            'Delete Course',
            true
        );

        if (confirmed) {
            this.courseLibrary.delete(courseId);
            this.saveCourseLibrary();

            // Clean up stored data
            localStorage.removeItem(`course_progress_${courseId}`);
            localStorage.removeItem(`last_session_${courseId}`);

            // Delete handle from IndexedDB
            await this.handleDB.deleteHandle(courseId);

            this.renderHomepage();
        }
    }

    showLessonContent() {
        // Auto-load first lesson if available
        if (this.courseStructure.length > 0 && this.courseStructure[0].lessons.length > 0) {
            this.loadLesson(0, 0);
        }
    }

    // Storage Management
    saveCourseLibrary() {
        // Store only serializable data, directory handles will be re-requested
        const libraryData = [];

        for (const [id, data] of this.courseLibrary.entries()) {
            libraryData.push({
                id,
                name: data.name,
                addedDate: data.addedDate,
                lastAccessed: data.lastAccessed
            });
        }

        localStorage.setItem('course_library', JSON.stringify(libraryData));
    }

    loadCourseLibrary() {
        const libraryData = localStorage.getItem('course_library');
        if (!libraryData) return;

        try {
            const courses = JSON.parse(libraryData);

            // Reconstruct the courseLibrary Map with metadata
            // Directory handles will be null and re-requested when needed
            for (const course of courses) {
                this.courseLibrary.set(course.id, {
                    name: course.name,
                    handle: null, // Will be re-requested
                    addedDate: course.addedDate,
                    lastAccessed: course.lastAccessed
                });
            }
        } catch (error) {
            console.error('Error loading course library:', error);
        }
    }

    saveCourseProgress(courseId) {
        const totalLessons = this.courseStructure.reduce((sum, section) =>
            sum + section.lessons.length, 0);
        const completedCount = this.completedLessons.size;
        const percentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

        const progressData = {
            courseName: this.courseName,
            completedLessons: Array.from(this.completedLessons),
            completedCount,
            totalLessons,
            percentage
        };
        localStorage.setItem(`course_progress_${courseId}`, JSON.stringify(progressData));
    }

    loadCourseProgress(courseId) {
        const savedData = localStorage.getItem(`course_progress_${courseId}`);
        if (savedData) {
            const progressData = JSON.parse(savedData);
            this.completedLessons = new Set(progressData.completedLessons || []);
        } else {
            this.completedLessons = new Set();
        }
    }

    saveLastSession() {
        if (!this.currentLesson || !this.currentCourseId) return;

        const { sectionIndex, lessonIndex } = this.currentLesson;
        const lesson = this.courseStructure[sectionIndex].lessons[lessonIndex];

        const sessionData = {
            sectionIndex,
            lessonIndex,
            lessonName: lesson.name,
            timestamp: Date.now()
        };
        localStorage.setItem(`last_session_${this.currentCourseId}`, JSON.stringify(sessionData));
        localStorage.setItem('last_course_id', this.currentCourseId);
    }

    loadLastSession() {
        const lastCourseId = localStorage.getItem('last_course_id');
        if (!lastCourseId) return;

        // We'll try to load the last course, but we need directory handle
        // This will be handled by the course library rendering
    }

    loadLastSessionForCourse(courseId) {
        const sessionData = localStorage.getItem(`last_session_${courseId}`);
        if (!sessionData) return null;
        return JSON.parse(sessionData);
    }

    saveVideoProgress() {
        localStorage.setItem('video_progress', JSON.stringify(this.videoProgress));
    }

    loadVideoProgress() {
        const savedProgress = localStorage.getItem('video_progress');
        if (savedProgress) {
            this.videoProgress = JSON.parse(savedProgress);
        }
    }
}

// Initialize the app
const courseViewer = new CourseViewer();

// Load video progress on init
courseViewer.loadVideoProgress();
