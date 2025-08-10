# OpenDrumsOnly

A mobile-optimized web gallery for browsing drum breaks and records. This responsive HTML/JavaScript website displays a collection of drum breaks with advanced search, filtering, and collection management features, optimized for modern smartphone browsers.

## Features

- **Browse Records**: View a paginated gallery of drum break records with cover art
- **Search**: Search by artist name, album title, or use advanced operators:
  - `title:` - Search track titles
  - `year:` - Search by year
  - `genre:` - Search by genre
  - `style:` - Search by style
  - `label:` - Search by record label
  - `/a` - Find artists starting with 'a'
- **Filter by Genre**: Filter records by genre or UBB tag
- **Sort**: Sort records alphabetically by artist name
- **Collection Management**: 
  - Add/remove items to your personal collection (vinyl icon)
  - Add/remove items to your wantlist (heart icon)
- **External Links**: 
  - Click record covers to view on Discogs
  - Search tracks on Spotify using the headphones icon

## Setup

1. Serve the files from a web server (due to CORS restrictions, you cannot open `index.html` directly in a browser)
2. The simplest way is to use Python's built-in server:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

3. Open your browser to `http://localhost:8000`

## Files

- `index.html` - Main HTML page
- `script.js` - JavaScript functionality
- `styles.css` - CSS styling
- `DrumBreaks.csv` - Data file containing record information
- `images/` - Directory containing record cover images
- `fonts/` - Custom Geist font files

## Data Format

The CSV file should contain the following columns:
- Artist Name
- Album Title
- Track Title
- Record Label
- Year
- Genre
- Style
- Tag
- Comment
- Discogs Release ID

## Local Storage

The application uses browser local storage to persist:
- Your personal collection
- Your wantlist

This data is stored locally in your browser and will persist between sessions.

## Mobile Optimization Features

This website is fully optimized for modern smartphone browsers with:

- **Touch-friendly Interface**: All buttons and interactive elements are sized appropriately for touch devices (44px minimum touch targets)
- **Responsive Design**: Adaptive layouts for various screen sizes with optimized card grids
- **Performance Optimizations**: 
  - Lazy loading for images
  - Passive event listeners for smooth scrolling
  - Optimized animations and transitions
- **Accessibility**: 
  - Screen reader support
  - Keyboard navigation
  - Focus indicators
  - ARIA labels for all interactive elements
- **PWA Features**: Can be added to home screen on iOS and Android devices
- **Smooth Animations**: Optimized for 60fps on mobile devices with hardware acceleration

## Browser Compatibility

Optimized for all modern mobile browsers including:
- Safari (iOS)
- Chrome (Android)
- Firefox Mobile
- Samsung Internet
- Edge Mobile
