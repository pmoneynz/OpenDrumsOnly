# OpenDrumsOnly

A mobile-optimized web gallery for browsing drum breaks and records. This responsive HTML/JavaScript website displays a collection of drum breaks with advanced search, filtering, and collection management features, optimized for modern smartphone browsers.

## Features

- **Browse Records**: View a paginated gallery of drum break records with cover art
- **Individual Entry Pages**: Each record has its own SEO-friendly page at `/entry/<releaseId>.html`
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
  - Click record covers to view entry detail page
  - View on Discogs using the external link icon
  - Search tracks on Spotify using the headphones icon
- **State Preservation**: When navigating to entry pages and back, your search/filter/scroll position is restored

## Build

Before deploying, you need to generate the individual entry pages. This requires Node.js (v18 or later recommended).

```bash
# Generate entry pages and sitemap
node build/generate-entry-pages.mjs
```

This command will:
- Read `DrumBreaks.csv` and extract all entries
- Generate individual HTML pages in `/entry/<releaseId>.html` (one per Discogs release)
- Update `sitemap.xml` with all entry page URLs
- Output a build report showing generated pages and any skipped entries

**Run this command before each deployment** whenever the CSV data changes.

## Setup

1. Generate entry pages (see Build section above)
2. Serve the files from a web server (due to CORS restrictions, you cannot open `index.html` directly in a browser)
3. The simplest way is to use Python's built-in server:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

4. Open your browser to `http://localhost:8000`

## Files

- `index.html` - Main HTML page (gallery/search)
- `script.js` - Gallery JavaScript functionality
- `entry.js` - Entry page JavaScript functionality
- `styles.css` - CSS styling (includes entry page styles)
- `DrumBreaks.csv` - Data file containing record information
- `images/` - Directory containing record cover images
- `fonts/` - Custom Geist font files
- `entry/` - Generated individual entry pages
- `build/` - Build scripts
  - `generate-entry-pages.mjs` - Entry page generator script
- `sitemap.xml` - Auto-generated sitemap with all URLs

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
