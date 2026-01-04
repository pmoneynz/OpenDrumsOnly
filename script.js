document.addEventListener('DOMContentLoaded', initializeApp, false);

/**
 * Analytics helper function
 * Tracks events to Google Analytics if gtag is available
 */
window.trackEvent = function(category, action, label, value) {
    if (typeof gtag !== 'undefined') {
        gtag('event', action, {
            'event_category': category,
            'event_label': label,
            'value': value
        });
    }
};

/**
 * Track search queries with debouncing
 */
let searchTimeout = null;
function trackSearch(query) {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
        if (query && query.trim().length > 0) {
            trackEvent('Search', 'search_query', query.trim().substring(0, 100), query.trim().length);
        }
    }, 1000); // Debounce for 1 second
}

function initializeApp() {
    // Check for saved gallery state from entry page navigation
    let savedState = null;
    try {
        const stateJson = sessionStorage.getItem('galleryState');
        if (stateJson) {
            savedState = JSON.parse(stateJson);
            sessionStorage.removeItem('galleryState'); // Clear after reading
        }
    } catch (e) {
        console.error('Error reading gallery state:', e);
    }

    loadCSV().then(data => {
        console.log('CSV data loaded:', data.length, 'rows');
        dataRows = data;
        dataRows.forEach(row => {
            if (row && typeof row === 'object') {
                const genre = row['Genre'] ? row['Genre'].trim() : '';
                if (genre) {
                    genres.add(genre);
                }
            } else {
                console.error('Invalid row:', row);
            }
        });
        populateGenreDropdown(genres);
        preprocessAlphabeticalData();
        generateAlphabetWheel();
        
        // Track initial page load
        if (typeof gtag !== 'undefined') {
            gtag('event', 'page_view', {
                'event_category': 'Gallery',
                'event_label': 'main_gallery',
                'total_entries': dataRows.length
            });
        }
        
        // Restore saved state if available
        if (savedState) {
            restoreGalleryState(savedState);
        } else {
            applyFilters();
        }
    }).catch(error => {
        console.error('Failed to load CSV:', error);
        if (error.code) {
            console.error('Error code:', error.code);
        }
        if (error.message) {
            console.error('Error message:', error.message);
        }
        // Display an error message to the user
        document.getElementById('gallery').innerHTML = '<p>Error loading data. Please try again later.</p>';
    });

    let dataRows = [];
    let genres = new Set();
    let alphabeticalData = {};
    let selectedLetter = '';
    let currentPage = 1;
    let itemsPerPage = 128;
//    let currentChunk = 0;
    let wantlist = new Set(JSON.parse(localStorage.getItem('wantlist')) || []);
    let collection = new Set(JSON.parse(localStorage.getItem('collection')) || []);
    let isViewingWantlist = false;
    let isViewingCollection = false;

    function loadCSV() {
        return new Promise((resolve, reject) => {
            fetch('./DrumBreaks.csv')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.text();
                })
                .then(csvText => {
                    Papa.parse(csvText, {
                        header: true,
                        skipEmptyLines: true,
                        complete: function(results) {
                            console.log('CSV loaded successfully');
                            console.log('First row:', results.data[0]);
                            console.log('Headers:', results.meta.fields);
                            resolve(results.data);
                        },
                        error: function(error) {
                            console.error('Error parsing CSV:', error);
                            reject(error);
                        }
                    });
                })
                .catch(error => {
                    console.error('Error loading CSV:', error);
                    reject(error);
                });
        });
    }

    function normalizeArtistName(artistName) {
        if (!artistName || typeof artistName !== 'string') {
            return '';
        }
        
        let normalized = artistName.trim();
        
        // Handle cases like "238s, The" or "Beatles, The"
        if (normalized.toLowerCase().endsWith(', the')) {
            normalized = normalized.substring(0, normalized.length - 5).trim();
        }
        // Handle cases like "The Beatles"
        else if (normalized.toLowerCase().startsWith('the ')) {
            normalized = normalized.substring(4).trim();
        }
        
        // Get first character and convert to uppercase
        const firstChar = normalized.charAt(0).toUpperCase();
        
        // Return letters A-Z
        if (firstChar >= 'A' && firstChar <= 'Z') {
            return firstChar;
        }
        
        // Return '0-9' for numerical characters
        if (firstChar >= '0' && firstChar <= '9') {
            return '0-9';
        }
        
        return '';
    }

    function preprocessAlphabeticalData() {
        alphabeticalData = {};
        
        // Initialize all letters A-Z
        for (let i = 65; i <= 90; i++) {
            alphabeticalData[String.fromCharCode(i)] = [];
        }
        
        // Initialize 0-9 category
        alphabeticalData['0-9'] = [];
        
        dataRows.forEach(row => {
            if (row && row['Artist Name']) {
                const letter = normalizeArtistName(row['Artist Name']);
                if (letter && alphabeticalData[letter]) {
                    alphabeticalData[letter].push(row);
                }
            }
        });
        
        console.log('Alphabetical data preprocessed:', Object.keys(alphabeticalData).map(letter => 
            `${letter}: ${alphabeticalData[letter].length}`
        ).join(', '));
    }

    function generateAlphabetWheel() {
        const alphabetWheel = document.getElementById('alphabet-wheel');
        alphabetWheel.innerHTML = '';
        
        // Create "All" button first
        const allBtn = document.createElement('button');
        allBtn.className = 'alphabet-btn' + (selectedLetter === '' ? ' active' : '');
        allBtn.textContent = 'All';
        allBtn.onclick = () => selectLetter('');
        allBtn.setAttribute('aria-label', 'Show all artists');
        alphabetWheel.appendChild(allBtn);
        
        // Create A-Z buttons
        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const btn = document.createElement('button');
            btn.className = 'alphabet-btn' + (selectedLetter === letter ? ' active' : '');
            btn.textContent = letter;
            btn.onclick = () => selectLetter(letter);
            btn.setAttribute('aria-label', `Show artists starting with ${letter}`);
            alphabetWheel.appendChild(btn);
        }
        
        // Create 0-9 button last
        const numbersBtn = document.createElement('button');
        numbersBtn.className = 'alphabet-btn' + (selectedLetter === '0-9' ? ' active' : '');
        numbersBtn.textContent = '0-9';
        numbersBtn.onclick = () => selectLetter('0-9');
        numbersBtn.setAttribute('aria-label', 'Show artists starting with numbers');
        alphabetWheel.appendChild(numbersBtn);
    }

    function selectLetter(letter) {
        selectedLetter = letter;
        currentPage = 1; // Reset to first page
        updateAlphabetButtons();
        scrollToActiveButton();
        trackEvent('Filter', 'alphabet_filter', letter || 'All', null);
        applyFilters();
    }

    function updateAlphabetButtons() {
        const buttons = document.querySelectorAll('.alphabet-btn');
        buttons.forEach(btn => {
            const isActive = (btn.textContent === 'All' && selectedLetter === '') || 
                           (btn.textContent === selectedLetter);
            btn.classList.toggle('active', isActive);
        });
    }

    function scrollToActiveButton() {
        const wheel = document.getElementById('alphabet-wheel');
        const activeButton = wheel.querySelector('.alphabet-btn.active');
        
        if (activeButton && wheel) {
            const wheelRect = wheel.getBoundingClientRect();
            const buttonRect = activeButton.getBoundingClientRect();
            const wheelCenter = wheelRect.width / 2;
            const buttonCenter = buttonRect.left - wheelRect.left + buttonRect.width / 2;
            const scrollDistance = buttonCenter - wheelCenter;
            
            wheel.scrollBy({
                left: scrollDistance,
                behavior: 'smooth'
            });
        }
    }

    document.getElementById('filter-genre').addEventListener('change', () => {
        const genreValue = document.getElementById('filter-genre').value;
        currentPage = 1;  // Reset to first page
        trackEvent('Filter', 'genre_filter', genreValue || 'All Genres', null);
        applyFilters();
    });
    document.getElementById('sort-by').addEventListener('change', () => {
        const sortValue = document.getElementById('sort-by').value;
        trackEvent('Filter', 'sort_change', sortValue, null);
        applyFilters();
    });
    document.getElementById('search-box').addEventListener('input', function() {
        trackSearch(this.value);
        applyFilters();
    });
    document.getElementById('view-wantlist').addEventListener('click', toggleWantlistView);
    document.getElementById('view-collection').addEventListener('click', toggleCollectionView);

    const searchBox = document.getElementById('search-box');
    const clearSearchBtn = document.getElementById('clear-search');

    searchBox.addEventListener('input', function() {
        clearSearchBtn.style.display = this.value ? 'block' : 'none';
        applyFilters();
    });

    clearSearchBtn.addEventListener('click', function() {
        trackEvent('Search', 'clear_search', null, null);
        searchBox.value = '';
        clearSearchBtn.style.display = 'none';
        searchBox.focus();
        applyFilters();
    });

    function applyFilters() {
        const genreFilter = document.getElementById('filter-genre').value.toLowerCase();
        const sortBy = document.getElementById('sort-by').value;
        const searchQuery = document.getElementById('search-box').value.toLowerCase();

        let filteredData = dataRows.filter(row => {
            // Letter filter check
            if (selectedLetter !== '') {
                const artistLetter = normalizeArtistName(row['Artist Name']);
                if (artistLetter !== selectedLetter) {
                    return false;
                }
            }
            if (isViewingWantlist && !wantlist.has(row['Artist Name'] + ' - ' + row['Album Title'])) {
                return false;
            }
            if (isViewingCollection && !collection.has(row['Artist Name'] + ' - ' + row['Album Title'])) {
                return false;
            }
            const tag = (row['Tag'] || '').toLowerCase();
            const genreVal = (row['Genre'] || '').toLowerCase();

            const matchesGenre =
                genreFilter === '' ||
                (genreFilter === 'ubb' && tag === 'ubb') ||
                genreVal.includes(genreFilter);

            // Parse search query for operators
            const operators = {
                'title:': (row['Track Title'] || '').toLowerCase(),
                'year:': (row['Year'] || '').toString(),
                'genre:': (row['Genre'] || '').toLowerCase(),
                'style:': (row['Style'] || '').toLowerCase(),
                'label:': (row['Record Label'] || '').toLowerCase()
            };

            let remainingQuery = searchQuery;
            let matchesSearch = true;

            // New operator for artist name starting with a specific letter
            const artistStartRegex = /\/(.)(?:\s|$)/g;
            const artistStartMatches = [...searchQuery.matchAll(artistStartRegex)];
            if (artistStartMatches.length > 0) {
                matchesSearch = matchesSearch && artistStartMatches.some(match => 
                    row['Artist Name'].toLowerCase().startsWith(match[1])
                );
                remainingQuery = remainingQuery.replace(artistStartRegex, '');
            }

            for (const [operator, field] of Object.entries(operators)) {
                const regex = new RegExp(`${operator}(\\S+)`, 'g');
                const matches = [...remainingQuery.matchAll(regex)];
                
                if (matches.length > 0) {
                    matchesSearch = matchesSearch && matches.some(match => field.includes(match[1]));
                    remainingQuery = remainingQuery.replace(regex, '');
                }
            }

            // Handle remaining query (artist and album search)
            const artist = row['Artist Name'].toLowerCase();
            const album = row['Album Title'].toLowerCase();
            const remainingTerms = remainingQuery.trim().split(/\s+/);
            matchesSearch = matchesSearch && remainingTerms.every(term => artist.includes(term) || album.includes(term));

            return matchesGenre && matchesSearch;
        });

        filteredData.sort((a, b) => {
            if (sortBy === 'artist-asc') {
                return a['Artist Name'].localeCompare(b['Artist Name']);
            } else if (sortBy === 'artist-desc') {
                return b['Artist Name'].localeCompare(a['Artist Name']);
            }
        });

        renderGallery(filteredData);
        renderPagination(filteredData.length);
        window.scrollTo(0, 0); // Scroll to top after applying filters
    }

    function populateGenreDropdown(genres) {
        const genreDropdown = document.getElementById('filter-genre');
        
        // Add the 'UBB' tag as the first option
        const ubbOption = document.createElement('option');
        ubbOption.value = 'ubb';
        ubbOption.textContent = 'UBB';
        genreDropdown.appendChild(ubbOption);

        // Add a separator
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────';
        genreDropdown.appendChild(separator);

        // Add the rest of the genres
        genres.forEach(genre => {
            const option = document.createElement('option');
            option.value = genre.toLowerCase();
            option.textContent = genre;
            genreDropdown.appendChild(option);
        });
    }

    function clearSearch() {
        const searchBox = document.getElementById('search-box');
        const clearSearchBtn = document.getElementById('clear-search');
        searchBox.value = '';
        clearSearchBtn.style.display = 'none';
        searchBox.focus();
        applyFilters();
    }

    /**
     * Extract release ID from Discogs URL
     * Example: https://www.discogs.com/release/2623666 -> 2623666
     */
    function extractReleaseId(discogsUrl) {
        if (!discogsUrl || typeof discogsUrl !== 'string') return null;
        const match = discogsUrl.match(/\/release\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Save current gallery state to sessionStorage before navigating to entry page
     */
    function saveGalleryState(event) {
        const state = {
            searchQuery: document.getElementById('search-box').value,
            genreFilter: document.getElementById('filter-genre').value,
            sortBy: document.getElementById('sort-by').value,
            selectedLetter: selectedLetter,
            currentPage: currentPage,
            scrollY: window.scrollY,
            isViewingWantlist: isViewingWantlist,
            isViewingCollection: isViewingCollection
        };
        sessionStorage.setItem('galleryState', JSON.stringify(state));
        
        // Track entry page click
        const link = event.currentTarget;
        const releaseId = link.href.match(/entry\/(\d+)\.html/);
        if (releaseId) {
            trackEvent('Navigation', 'view_entry_page', releaseId[1], null);
        }
    }

    /**
     * Restore gallery state from sessionStorage (called when returning from entry page)
     */
    function restoreGalleryState(state) {
        console.log('Restoring gallery state:', state);
        
        // Track return from entry page
        trackEvent('Navigation', 'return_from_entry', null, null);
        
        // Restore form values
        if (state.searchQuery) {
            document.getElementById('search-box').value = state.searchQuery;
            document.getElementById('clear-search').style.display = 'block';
        }
        
        if (state.genreFilter) {
            document.getElementById('filter-genre').value = state.genreFilter;
        }
        
        if (state.sortBy) {
            document.getElementById('sort-by').value = state.sortBy;
        }
        
        // Restore state variables
        if (state.selectedLetter !== undefined) {
            selectedLetter = state.selectedLetter;
            updateAlphabetButtons();
            scrollToActiveButton();
        }
        
        if (state.currentPage) {
            currentPage = state.currentPage;
        }
        
        if (state.isViewingWantlist !== undefined) {
            isViewingWantlist = state.isViewingWantlist;
        }
        
        if (state.isViewingCollection !== undefined) {
            isViewingCollection = state.isViewingCollection;
        }
        
        // Update view icons if needed
        updateViewIcons();
        
        // Apply filters with restored state (don't scroll to top)
        applyFiltersWithoutScroll();
        
        // Restore scroll position after a short delay to ensure DOM is ready
        if (state.scrollY) {
            requestAnimationFrame(() => {
                window.scrollTo(0, state.scrollY);
            });
        }
    }

    /**
     * Apply filters without scrolling to top (used when restoring state)
     */
    function applyFiltersWithoutScroll() {
        const genreFilter = document.getElementById('filter-genre').value.toLowerCase();
        const sortBy = document.getElementById('sort-by').value;
        const searchQuery = document.getElementById('search-box').value.toLowerCase();

        let filteredData = dataRows.filter(row => {
            // Letter filter check
            if (selectedLetter !== '') {
                const artistLetter = normalizeArtistName(row['Artist Name']);
                if (artistLetter !== selectedLetter) {
                    return false;
                }
            }
            if (isViewingWantlist && !wantlist.has(row['Artist Name'] + ' - ' + row['Album Title'])) {
                return false;
            }
            if (isViewingCollection && !collection.has(row['Artist Name'] + ' - ' + row['Album Title'])) {
                return false;
            }
            const tag = (row['Tag'] || '').toLowerCase();
            const genreVal = (row['Genre'] || '').toLowerCase();

            const matchesGenre =
                genreFilter === '' ||
                (genreFilter === 'ubb' && tag === 'ubb') ||
                genreVal.includes(genreFilter);

            // Parse search query for operators
            const operators = {
                'title:': (row['Track Title'] || '').toLowerCase(),
                'year:': (row['Year'] || '').toString(),
                'genre:': (row['Genre'] || '').toLowerCase(),
                'style:': (row['Style'] || '').toLowerCase(),
                'label:': (row['Record Label'] || '').toLowerCase()
            };

            let remainingQuery = searchQuery;
            let matchesSearch = true;

            // New operator for artist name starting with a specific letter
            const artistStartRegex = /\/(.)(?:\s|$)/g;
            const artistStartMatches = [...searchQuery.matchAll(artistStartRegex)];
            if (artistStartMatches.length > 0) {
                matchesSearch = matchesSearch && artistStartMatches.some(match => 
                    row['Artist Name'].toLowerCase().startsWith(match[1])
                );
                remainingQuery = remainingQuery.replace(artistStartRegex, '');
            }

            for (const [operator, field] of Object.entries(operators)) {
                const regex = new RegExp(`${operator}(\\S+)`, 'g');
                const matches = [...remainingQuery.matchAll(regex)];
                
                if (matches.length > 0) {
                    matchesSearch = matchesSearch && matches.some(match => field.includes(match[1]));
                    remainingQuery = remainingQuery.replace(regex, '');
                }
            }

            // Handle remaining query (artist and album search)
            const artist = row['Artist Name'].toLowerCase();
            const album = row['Album Title'].toLowerCase();
            const remainingTerms = remainingQuery.trim().split(/\s+/);
            matchesSearch = matchesSearch && remainingTerms.every(term => artist.includes(term) || album.includes(term));

            return matchesGenre && matchesSearch;
        });

        filteredData.sort((a, b) => {
            if (sortBy === 'artist-asc') {
                return a['Artist Name'].localeCompare(b['Artist Name']);
            } else if (sortBy === 'artist-desc') {
                return b['Artist Name'].localeCompare(a['Artist Name']);
            }
        });

        renderGallery(filteredData);
        renderPagination(filteredData.length);
        // Don't scroll to top when restoring state
    }

    function renderGallery(rows) {
        const gallery = document.getElementById('gallery');
        gallery.innerHTML = '';

        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedRows = rows.slice(start, end);

        paginatedRows.forEach(row => {
            const { 'Artist Name': artist, 'Album Title': album, 'Track Title': track, 'Record Label': label, 'Year': year, 'Genre': genre, 'Style': style, 'Tag': tag, 'Comment': comment, 'Discogs Release ID': url } = row;

            const card = document.createElement('div');
            card.className = 'card';

            const imageUrl = `./images/${encodeURIComponent(artist)}-${encodeURIComponent(album)}.jpeg`;
            const isInWantlist = wantlist.has(artist + ' - ' + album);
            const isInCollection = collection.has(artist + ' - ' + album);
            
            // Extract release ID for entry page link
            const releaseId = extractReleaseId(url);
            const entryPageUrl = releaseId ? `./entry/${releaseId}.html` : url;
            const hasEntryPage = !!releaseId;

            const sanitizeForJS = (str) => {
                return str
                    .replace(/'/g, '')         // Remove apostrophes
                    .replace(/[^\w\sÜüÖöぁ-んァ-ン一-龯А-Яа-яก-๙-]/g, '') // Remove special characters except spaces, hyphens, umlauts, and CJK/Cyrillic/Thai chars
                    .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
                    .trim();                   // Remove leading/trailing spaces
            };

            card.innerHTML = `
                <div class="card-content">
                    <a href="${entryPageUrl}" class="entry-link" ${hasEntryPage ? '' : 'target="_blank" rel="noopener"'}>
                        <img src="${imageUrl}" 
                             alt="${artist} - ${album}" 
                             loading="lazy"
                             onerror="this.onerror=null;this.src='./images/NotFound.jpeg';"
                             style="object-fit: cover; width: 100%; height: auto;">
                    </a>
                    <p style="font-family: 'Geist', sans-serif; font-weight: 700;">${artist}</p>
                    <p style="font-family: 'Geist', sans-serif; font-weight: 400;">${album}</p>
                    <p style="font-family: 'Geist', sans-serif; font-weight: 200; font-size: 0.9em;">${track}</p>
                    <p style="font-family: 'Geist', sans-serif; font-weight: 200; font-size: 0.7em;">${year} | ${genre} | ${style}</p>
                </div>
                <div class="card-actions">
                    <button class="collection-btn" data-artist="${artist}" data-album="${album}" title="${isInCollection ? 'Remove from Collection' : 'Add to Collection'}" aria-label="${isInCollection ? 'Remove from Collection' : 'Add to Collection'}">
                        <i class="fa-record-vinyl ${isInCollection ? 'fas' : 'far'}"></i>
                    </button>
                    <button class="wantlist-btn" data-artist="${artist}" data-album="${album}" title="${isInWantlist ? 'Remove from Wantlist' : 'Add to Wantlist'}" aria-label="${isInWantlist ? 'Remove from Wantlist' : 'Add to Wantlist'}">
                        <i class="fa-heart ${isInWantlist ? 'fas' : 'far'}"></i>
                    </button>
                    <button class="spotify-btn" onclick="searchSpotify('${sanitizeForJS(artist)}', '${sanitizeForJS(track)}', '${releaseId || ''}')" title="Listen on Spotify" aria-label="Listen on Spotify">
                        <i class="fas fa-headphones"></i>
                    </button>
                    <a href="${url}" target="_blank" rel="noopener" class="discogs-btn" title="View on Discogs" aria-label="View on Discogs" onclick="trackEvent('External', 'discogs_click', '${releaseId || 'unknown'}', null);">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
            `;

            gallery.appendChild(card);
        });

        document.querySelectorAll('.wantlist-btn').forEach(btn => {
            btn.addEventListener('click', toggleWantlistItem);
        });

        document.querySelectorAll('.collection-btn').forEach(btn => {
            btn.addEventListener('click', toggleCollectionItem);
        });

        // Add click handlers to entry links to save gallery state before navigation
        document.querySelectorAll('.entry-link').forEach(link => {
            if (!link.hasAttribute('target')) {
                link.addEventListener('click', saveGalleryState);
            }
        });

        // After rendering is complete, check for broken images
        checkBrokenImages();
    }

    function renderPagination(totalItems) {
        const pagination = document.getElementById('pagination');
        pagination.innerHTML = '';

        const totalPages = Math.ceil(totalItems / itemsPerPage);

        // Create Previous button
        const prevButton = createPaginationButton('Previous', () => {
            if (currentPage > 1) {
                currentPage--;
                applyFilters();
            }
        });
        prevButton.disabled = currentPage === 1;
        pagination.appendChild(prevButton);

        // First page
        if (totalPages > 3) {
            pagination.appendChild(createPageButton(1));
            if (currentPage > 3) {
                pagination.appendChild(createEllipsis());
            }
        }

        // Page numbers
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pagination.appendChild(createPageButton(i));
        }

        // Last page
        if (totalPages > 3) {
            if (currentPage < totalPages - 2) {
                pagination.appendChild(createEllipsis());
            }
            pagination.appendChild(createPageButton(totalPages));
        }

        // Create Next button
        const nextButton = createPaginationButton('Next', () => {
            if (currentPage < totalPages) {
                currentPage++;
                applyFilters();
            }
        });
        nextButton.disabled = currentPage === totalPages;
        pagination.appendChild(nextButton);
    }

    function createPaginationButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.addEventListener('click', (e) => {
            e.preventDefault();
            if (text === 'Previous' || text === 'Next') {
                trackEvent('Navigation', 'pagination', text.toLowerCase(), null);
            }
            onClick();
            window.scrollTo(0, 0); // Scroll to top after clicking
        });
        button.classList.add('pagination-button');
        return button;
    }

    function createPageButton(pageNumber) {
        const button = createPaginationButton(pageNumber, () => {
            if (currentPage !== pageNumber) {
                currentPage = pageNumber;
                trackEvent('Navigation', 'pagination', `page_${pageNumber}`, pageNumber);
                applyFilters();
            }
        });
        if (pageNumber === currentPage) {
            button.classList.add('active');
        }
        return button;
    }

    function createEllipsis() {
        const span = document.createElement('span');
        span.textContent = '...';
        span.classList.add('pagination-ellipsis');
        return span;
    }

    function toggleWantlistItem(event) {
        const button = event.currentTarget;
        const artist = button.dataset.artist;
        const album = button.dataset.album;
        const key = artist + ' - ' + album;
        const heartIcon = button.querySelector('i');
        const collectionButton = button.parentElement.querySelector('.collection-btn');
        const vinylIcon = collectionButton.querySelector('i');

        if (wantlist.has(key)) {
            wantlist.delete(key);
            heartIcon.classList.replace('fas', 'far');
            trackEvent('Collection', 'remove_wantlist', `${artist} - ${album}`, null);
        } else {
            wantlist.add(key);
            heartIcon.classList.replace('far', 'fas');
            trackEvent('Collection', 'add_wantlist', `${artist} - ${album}`, null);
            // Remove from collection if it's there
            if (collection.has(key)) {
                collection.delete(key);
                vinylIcon.classList.replace('fas', 'far');
                trackEvent('Collection', 'remove_collection', `${artist} - ${album}`, null);
            }
        }

        localStorage.setItem('wantlist', JSON.stringify(Array.from(wantlist)));
        localStorage.setItem('collection', JSON.stringify(Array.from(collection)));
    }

    function toggleCollectionItem(event) {
        const button = event.currentTarget;
        const artist = button.dataset.artist;
        const album = button.dataset.album;
        const key = artist + ' - ' + album;
        const vinylIcon = button.querySelector('i');
        const wantlistButton = button.parentElement.querySelector('.wantlist-btn');
        const heartIcon = wantlistButton.querySelector('i');

        if (collection.has(key)) {
            collection.delete(key);
            vinylIcon.classList.replace('fas', 'far');
            trackEvent('Collection', 'remove_collection', `${artist} - ${album}`, null);
        } else {
            collection.add(key);
            vinylIcon.classList.replace('far', 'fas');
            trackEvent('Collection', 'add_collection', `${artist} - ${album}`, null);
            // Remove from wantlist if it's there
            if (wantlist.has(key)) {
                wantlist.delete(key);
                heartIcon.classList.replace('fas', 'far');
                trackEvent('Collection', 'remove_wantlist', `${artist} - ${album}`, null);
            }
        }

        localStorage.setItem('collection', JSON.stringify(Array.from(collection)));
        localStorage.setItem('wantlist', JSON.stringify(Array.from(wantlist)));
    }

    function toggleWantlistView() {
        isViewingWantlist = !isViewingWantlist;
        isViewingCollection = false;
        updateViewIcons();
        currentPage = 1;
        trackEvent('View', isViewingWantlist ? 'view_wantlist' : 'view_all', null, null);
        applyFilters();
    }

    function toggleCollectionView() {
        isViewingCollection = !isViewingCollection;
        isViewingWantlist = false;
        updateViewIcons();
        currentPage = 1;
        trackEvent('View', isViewingCollection ? 'view_collection' : 'view_all', null, null);
        applyFilters();
    }

    function updateViewIcons() {
        const wantlistButton = document.getElementById('view-wantlist');
        const collectionButton = document.getElementById('view-collection');
        const wantlistIcon = wantlistButton.querySelector('i');
        const collectionIcon = collectionButton.querySelector('i');

        if (isViewingWantlist) {
            wantlistIcon.className = 'fas fa-heart';
            wantlistButton.classList.add('active');
            wantlistButton.title = 'View All';
        } else {
            wantlistIcon.className = 'far fa-heart';
            wantlistButton.classList.remove('active');
            wantlistButton.title = 'View Wantlist';
        }

        if (isViewingCollection) {
            collectionIcon.className = 'fas fa-record-vinyl';
            collectionButton.classList.add('active');
            collectionButton.title = 'View All';
        } else {
            collectionIcon.className = 'far fa-record-vinyl';
            collectionButton.classList.remove('active');
            collectionButton.title = 'View Collection';
        }
    }

    function clearFocus() {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    }

    // Add touch event listeners to the buttons with passive event listeners for better performance
    document.getElementById('view-wantlist').addEventListener('touchend', clearFocus, { passive: true });
    document.getElementById('view-collection').addEventListener('touchend', clearFocus, { passive: true });
    
    // Optimize scroll performance on mobile
    let ticking = false;
    function updateBackToTopButton() {
        if (window.pageYOffset > 300) {
            backToTopButton.style.display = 'block';
        } else {
            backToTopButton.style.display = 'none';
        }
        ticking = false;
    }
    
    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateBackToTopButton);
            ticking = true;
        }
    }

    window.searchSpotify = function(artist, track, releaseId) {
        // Sanitize artist and track names
        const sanitizeString = (str) => {
            return str
                .replace(/'/g, '')         // Remove apostrophes
                .replace(/[^\w\sÜüÖöぁ-んァ-ン一-龯А-Яа-яก-๙-]/g, '') // Remove special characters except spaces, hyphens, umlauts, and CJK/Cyrillic/Thai chars
                .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
                .trim();                   // Remove leading/trailing spaces
        };

        const sanitizedArtist = sanitizeString(artist);
        const sanitizedTrack = sanitizeString(track);
        const searchQuery = encodeURIComponent(`${sanitizedArtist} ${sanitizedTrack}`);
        const spotifyUrl = `https://open.spotify.com/search/${searchQuery}`;
        
        trackEvent('External', 'spotify_search', `${artist} - ${track}`, releaseId || null);
        window.open(spotifyUrl, '_blank');
    }

    // Back to Top functionality
    const backToTopButton = document.getElementById('back-to-top');

    window.addEventListener('scroll', requestTick, { passive: true });

    backToTopButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Add this function to your script
    function checkBrokenImages() {
        const gallery = document.getElementById('gallery');
        const brokenImages = [];

        gallery.querySelectorAll('.card img').forEach(img => {
            if (img.src.endsWith('NotFound.jpeg')) {
                const artistElement = img.parentElement.parentElement.querySelector('p:nth-child(2)');
                const albumElement = img.parentElement.parentElement.querySelector('p:nth-child(3)');
                const artist = artistElement ? artistElement.textContent : 'Unknown Artist';
                const album = albumElement ? albumElement.textContent : 'Unknown Album';
                brokenImages.push(`${artist} - ${album}`);
            }
        });

        console.log('Entries with broken image links:');
        brokenImages.forEach(entry => console.log(entry));
        console.log(`Total broken images: ${brokenImages.length}`);
    }

    // Add this code to your existing JavaScript file
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.querySelector('.search-input-wrapper input');
        const clearButton = document.getElementById('clear-search');

        // Show/hide clear button based on input content
        searchInput.addEventListener('input', function() {
            clearButton.style.display = this.value ? 'block' : 'none';
        });

        // Clear input when button is clicked
        clearButton.addEventListener('click', function() {
            searchInput.value = '';
            clearButton.style.display = 'none';
            // Trigger the search function or event to update results
            searchInput.dispatchEvent(new Event('input'));
        });
    });
}
