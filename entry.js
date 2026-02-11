/**
 * Entry Page JavaScript for OpenDrumsOnly
 * Handles collection/wantlist toggles, Spotify search, and back navigation
 */

(function() {
    /**
     * Analytics helper function
     * Tracks events to Google Analytics if gtag is available
     */
    function trackEvent(category, action, label, value) {
        if (typeof gtag !== 'undefined') {
            gtag('event', action, {
                'event_category': category,
                'event_label': label,
                'value': value
            });
        }
    }
    
    // Get entry data from embedded JSON
    const entryDataScript = document.getElementById('entry-data');
    if (!entryDataScript) {
        console.error('Entry data not found');
        return;
    }
    
    const entry = JSON.parse(entryDataScript.textContent);
    const key = entry.artist + ' - ' + entry.album;
    
    // Track entry page view with entry details
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            'event_category': 'Entry',
            'event_label': `${entry.artist} - ${entry.album}`,
            'release_id': entry.releaseId,
            'genre': entry.genre,
            'year': entry.year
        });
    }
    
    // Load collection and wantlist from localStorage
    let wantlist = new Set(JSON.parse(localStorage.getItem('wantlist')) || []);
    let collection = new Set(JSON.parse(localStorage.getItem('collection')) || []);
    
    // DOM elements
    const collectionBtn = document.getElementById('collection-btn');
    const wantlistBtn = document.getElementById('wantlist-btn');
    const spotifyBtn = document.getElementById('spotify-btn');
    const backBtn = document.getElementById('back-to-results');
    const youtubeMount = document.getElementById('youtube-embed');
    const entryImage = document.querySelector('.entry-image');
    if (backBtn) {
        backBtn.setAttribute('aria-label', 'Back to Results');
    }

    function loadImageAliases() {
        return fetch('../image-aliases.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .catch(() => ({}));
    }

    function resolveEntryCoverImage() {
        if (!entryImage) return;
        const expectedFilename = `${entry.artist || ''}-${entry.album || ''}.jpeg`;
        loadImageAliases().then(aliases => {
            const resolvedFilename = aliases[expectedFilename];
            if (!resolvedFilename) return;
            entryImage.src = `../images/${encodeURIComponent(resolvedFilename)}`;
        });
    }
    
    /**
     * Update button states based on current collection/wantlist
     */
    function updateButtonStates() {
        const isInCollection = collection.has(key);
        const isInWantlist = wantlist.has(key);
        
        if (collectionBtn) {
            const icon = collectionBtn.querySelector('i');
            icon.className = isInCollection ? 'fas fa-record-vinyl' : 'far fa-record-vinyl';
            collectionBtn.title = isInCollection ? 'Remove from Collection' : 'Add to Collection';
        }
        
        if (wantlistBtn) {
            const icon = wantlistBtn.querySelector('i');
            icon.className = isInWantlist ? 'fas fa-heart' : 'far fa-heart';
            wantlistBtn.title = isInWantlist ? 'Remove from Wantlist' : 'Add to Wantlist';
        }
    }
    
    /**
     * Toggle collection status
     */
    function toggleCollection() {
        if (collection.has(key)) {
            collection.delete(key);
            trackEvent('Collection', 'remove_collection', key, entry.releaseId);
        } else {
            collection.add(key);
            trackEvent('Collection', 'add_collection', key, entry.releaseId);
            // Remove from wantlist if adding to collection
            if (wantlist.has(key)) {
                wantlist.delete(key);
                trackEvent('Collection', 'remove_wantlist', key, entry.releaseId);
            }
        }
        
        localStorage.setItem('collection', JSON.stringify(Array.from(collection)));
        localStorage.setItem('wantlist', JSON.stringify(Array.from(wantlist)));
        updateButtonStates();
    }
    
    /**
     * Toggle wantlist status
     */
    function toggleWantlist() {
        if (wantlist.has(key)) {
            wantlist.delete(key);
            trackEvent('Collection', 'remove_wantlist', key, entry.releaseId);
        } else {
            wantlist.add(key);
            trackEvent('Collection', 'add_wantlist', key, entry.releaseId);
            // Remove from collection if adding to wantlist
            if (collection.has(key)) {
                collection.delete(key);
                trackEvent('Collection', 'remove_collection', key, entry.releaseId);
            }
        }
        
        localStorage.setItem('wantlist', JSON.stringify(Array.from(wantlist)));
        localStorage.setItem('collection', JSON.stringify(Array.from(collection)));
        updateButtonStates();
    }
    
    /**
     * Sanitize string for Spotify search
     */
    function sanitizeForSearch(str) {
        return str
            .replace(/'/g, '')
            .replace(/[^\w\sÜüÖöぁ-んァ-ン一-龯А-Яа-яก-๙-]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Render YouTube embed if we have a confident match; otherwise show a search link.
     * (Video IDs are computed at build-time via Discogs release.videos[] enrichment.)
     */
    function renderYouTube() {
        if (!youtubeMount) return;

        const artist = sanitizeForSearch(entry.artist || '');
        const track = sanitizeForSearch(entry.track || '');
        const q = encodeURIComponent(`${artist} ${track}`.trim());

        const videoId = (entry.youtubeVideoId || '').toString().replace(/[^a-zA-Z0-9_-]/g, '');

        if (videoId) {
            youtubeMount.innerHTML = `
                <div class="yt-embed">
                    <iframe
                        src="https://www.youtube-nocookie.com/embed/${videoId}"
                        title="YouTube player"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    ></iframe>
                </div>
                <a class="action-btn yt-search-btn" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">
                    <i class="fa-brands fa-youtube"></i>
                    <span>YouTube</span>
                </a>
            `;
            return;
        }

        // No ID available: safe fallback is a YouTube search.
        youtubeMount.innerHTML = `
            <a class="action-btn yt-search-btn" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">
                <i class="fa-brands fa-youtube"></i>
                <span>YouTube</span>
            </a>
        `;

        const link = youtubeMount.querySelector('a');
        if (link) {
            link.addEventListener('click', () => {
                trackEvent('External', 'youtube_search', key, entry.releaseId);
            });
        }
    }
    
    /**
     * Search on Spotify
     */
    function searchSpotify() {
        const artist = sanitizeForSearch(entry.artist);
        const track = sanitizeForSearch(entry.track || entry.album);
        const searchQuery = encodeURIComponent(`${artist} ${track}`);
        const spotifyUrl = `https://open.spotify.com/search/${searchQuery}`;
        
        trackEvent('External', 'spotify_search', key, entry.releaseId);
        window.open(spotifyUrl, '_blank');
    }
    
    /**
     * Navigate back to gallery results
     */
    function backToResults() {
        trackEvent('Navigation', 'back_to_gallery', entry.releaseId, null);
        
        // Check if we have stored gallery state
        const galleryState = sessionStorage.getItem('galleryState');
        
        if (galleryState) {
            // Navigate back to gallery - state will be restored on load
            window.location.href = '../index.html';
        } else {
            // No stored state, just go to gallery
            window.location.href = '../index.html';
        }
    }
    
    // Initialize button states
    updateButtonStates();
    renderYouTube();
    resolveEntryCoverImage();
    
    // Attach event listeners
    if (collectionBtn) {
        collectionBtn.addEventListener('click', toggleCollection);
    }
    
    if (wantlistBtn) {
        wantlistBtn.addEventListener('click', toggleWantlist);
    }
    
    if (spotifyBtn) {
        spotifyBtn.addEventListener('click', searchSpotify);
    }
    
    if (backBtn) {
        backBtn.addEventListener('click', backToResults);
    }
})();

