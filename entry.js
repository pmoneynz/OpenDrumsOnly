/**
 * Entry Page JavaScript for OpenDrumsOnly
 * Handles collection/wantlist toggles, Spotify search, and back navigation
 */

(function() {
    // Get entry data from embedded JSON
    const entryDataScript = document.getElementById('entry-data');
    if (!entryDataScript) {
        console.error('Entry data not found');
        return;
    }
    
    const entry = JSON.parse(entryDataScript.textContent);
    const key = entry.artist + ' - ' + entry.album;
    
    // Load collection and wantlist from localStorage
    let wantlist = new Set(JSON.parse(localStorage.getItem('wantlist')) || []);
    let collection = new Set(JSON.parse(localStorage.getItem('collection')) || []);
    
    // DOM elements
    const collectionBtn = document.getElementById('collection-btn');
    const wantlistBtn = document.getElementById('wantlist-btn');
    const spotifyBtn = document.getElementById('spotify-btn');
    const backBtn = document.getElementById('back-to-results');
    
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
        } else {
            collection.add(key);
            // Remove from wantlist if adding to collection
            if (wantlist.has(key)) {
                wantlist.delete(key);
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
        } else {
            wantlist.add(key);
            // Remove from collection if adding to wantlist
            if (collection.has(key)) {
                collection.delete(key);
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
     * Search on Spotify
     */
    function searchSpotify() {
        const artist = sanitizeForSearch(entry.artist);
        const track = sanitizeForSearch(entry.track || entry.album);
        const searchQuery = encodeURIComponent(`${artist} ${track}`);
        const spotifyUrl = `https://open.spotify.com/search/${searchQuery}`;
        window.open(spotifyUrl, '_blank');
    }
    
    /**
     * Navigate back to gallery results
     */
    function backToResults() {
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

