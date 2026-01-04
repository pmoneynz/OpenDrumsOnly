#!/usr/bin/env node
/**
 * Static Entry Page Generator for OpenDrumsOnly
 * 
 * Reads DrumBreaks.csv and generates:
 * - Individual HTML pages in /entry/<releaseId>.html
 * - Updated sitemap.xml with all entry URLs
 * 
 * Usage: node build/generate-entry-pages.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const ENTRY_DIR = join(ROOT_DIR, 'entry');
const CSV_PATH = join(ROOT_DIR, 'DrumBreaks.csv');
const SITEMAP_PATH = join(ROOT_DIR, 'sitemap.xml');
const BASE_URL = 'https://www.opendrumsonly.com';

// Build report
const report = {
    totalRows: 0,
    generated: 0,
    skipped: [],
};

/**
 * Parse CSV file (simple parser for this specific format)
 */
function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const headers = parseCSVLine(lines[0]);
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        rows.push(row);
    }
    
    return rows;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
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
 * Escape HTML special characters
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Escape string for JSON embedding
 */
function escapeJson(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

/**
 * Generate HTML for a single entry page
 */
function generateEntryHtml(entry, releaseId) {
    const artist = entry['Artist Name'] || 'Unknown Artist';
    const album = entry['Album Title'] || 'Unknown Album';
    const track = entry['Track Title'] || '';
    const label = entry['Record Label'] || '';
    const year = entry['Year'] || '';
    const genre = entry['Genre'] || '';
    const style = entry['Style'] || '';
    const tag = entry['Tag'] || '';
    const comment = entry['Comment'] || '';
    const discogsUrl = entry['Discogs Release ID'] || '';
    
    const title = `${artist} - ${album} | OpenDrumsOnly`;
    const description = `${track ? `"${track}" from ` : ''}${album} by ${artist}${year ? ` (${year})` : ''}${genre ? `. ${genre}` : ''}. Drum break from the OpenDrumsOnly collection.`;
    const imageUrl = `../images/${encodeURIComponent(artist)}-${encodeURIComponent(album)}.jpeg`;
    const canonicalUrl = `${BASE_URL}/entry/${releaseId}.html`;
    
    // Entry data as JSON for client-side JS
    const entryJson = JSON.stringify({
        artist,
        album,
        track,
        label,
        year,
        genre,
        style,
        tag,
        comment,
        discogsUrl,
        releaseId,
    });
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- SEO Meta Tags -->
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonicalUrl}">
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="music.album">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:site_name" content="OpenDrumsOnly">
    <meta property="og:image" content="${BASE_URL}/images/${encodeURIComponent(artist)}-${encodeURIComponent(album)}.jpeg">
    
    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    
    <!-- Structured Data -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "MusicRecording",
        "name": "${escapeJson(track || album)}",
        "byArtist": {
            "@type": "MusicGroup",
            "name": "${escapeJson(artist)}"
        },
        "inAlbum": {
            "@type": "MusicAlbum",
            "name": "${escapeJson(album)}"${year ? `,
            "datePublished": "${year}"` : ''}${label ? `,
            "recordLabel": {
                "@type": "Organization",
                "name": "${escapeJson(label)}"
            }` : ''}
        }${genre ? `,
        "genre": "${escapeJson(genre)}"` : ''}
    }
    </script>
    
    <link rel="stylesheet" href="../styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    
    <!-- Entry data for client-side JS -->
    <script id="entry-data" type="application/json">${entryJson}</script>
</head>
<body class="entry-page">
    <header>
        <h1><a href="../index.html" style="text-decoration: none; color: inherit;">OpenDrumsOnly</a></h1>
        <div class="header-controls">
            <button id="back-to-results" class="icon-button" title="Back to Results">
                <i class="fas fa-arrow-left"></i>
            </button>
        </div>
    </header>
    
    <main class="entry-main">
        <div class="entry-container">
            <div class="entry-image-wrapper">
                <img 
                    src="${imageUrl}" 
                    alt="${escapeHtml(artist)} - ${escapeHtml(album)}"
                    onerror="this.onerror=null;this.src='../images/NotFound.jpeg';"
                    class="entry-image"
                >
            </div>
            
            <div class="entry-details">
                <h2 class="entry-artist">${escapeHtml(artist)}</h2>
                <h3 class="entry-album">${escapeHtml(album)}</h3>
                ${track ? `<p class="entry-track">"${escapeHtml(track)}"</p>` : ''}
                
                <div class="entry-meta">
                    ${year ? `<span class="entry-year">${escapeHtml(year)}</span>` : ''}
                    ${genre ? `<span class="entry-genre">${escapeHtml(genre)}</span>` : ''}
                    ${style ? `<span class="entry-style">${escapeHtml(style)}</span>` : ''}
                </div>
                
                ${label ? `<p class="entry-label">Label: ${escapeHtml(label)}</p>` : ''}
                ${tag ? `<p class="entry-tag">Tag: ${escapeHtml(tag)}</p>` : ''}
                ${comment ? `<p class="entry-comment">${escapeHtml(comment)}</p>` : ''}
                
                <div class="entry-actions">
                    <button id="collection-btn" class="action-btn" title="Add to Collection">
                        <i class="far fa-record-vinyl"></i>
                        <span>Collection</span>
                    </button>
                    <button id="wantlist-btn" class="action-btn" title="Add to Wantlist">
                        <i class="far fa-heart"></i>
                        <span>Wantlist</span>
                    </button>
                    <button id="spotify-btn" class="action-btn" title="Search on Spotify">
                        <i class="fas fa-headphones"></i>
                        <span>Spotify</span>
                    </button>
                    <a href="${escapeHtml(discogsUrl)}" target="_blank" rel="noopener" class="action-btn discogs-btn" title="View on Discogs">
                        <i class="fas fa-external-link-alt"></i>
                        <span>Discogs</span>
                    </a>
                </div>
            </div>
        </div>
    </main>
    
    <script src="../entry.js"></script>
</body>
</html>`;
}

/**
 * Generate sitemap.xml with all entry URLs
 */
function generateSitemap(releaseIds) {
    const today = new Date().toISOString().split('T')[0];
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

    <!-- Main page -->
    <url>
        <loc>${BASE_URL}/</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>

    <url>
        <loc>${BASE_URL}/index.html</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>

    <!-- Entry pages -->
`;
    
    for (const releaseId of releaseIds) {
        xml += `    <url>
        <loc>${BASE_URL}/entry/${releaseId}.html</loc>
        <lastmod>${today}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.8</priority>
    </url>
`;
    }
    
    xml += `</urlset>`;
    
    return xml;
}

/**
 * Main build function
 */
function build() {
    console.log('🔨 OpenDrumsOnly Static Entry Page Generator\n');
    
    // Ensure entry directory exists
    if (!existsSync(ENTRY_DIR)) {
        mkdirSync(ENTRY_DIR, { recursive: true });
    }
    
    // Read and parse CSV
    console.log('📖 Reading DrumBreaks.csv...');
    const csvText = readFileSync(CSV_PATH, 'utf-8');
    const rows = parseCSV(csvText);
    report.totalRows = rows.length;
    console.log(`   Found ${rows.length} entries\n`);
    
    // Generate entry pages
    console.log('📝 Generating entry pages...');
    const generatedReleaseIds = [];
    
    for (const row of rows) {
        const discogsUrl = row['Discogs Release ID'];
        const releaseId = extractReleaseId(discogsUrl);
        
        if (!releaseId) {
            report.skipped.push({
                artist: row['Artist Name'],
                album: row['Album Title'],
                reason: 'Invalid or missing Discogs URL',
            });
            continue;
        }
        
        // Check for duplicate release IDs
        if (generatedReleaseIds.includes(releaseId)) {
            report.skipped.push({
                artist: row['Artist Name'],
                album: row['Album Title'],
                reason: `Duplicate release ID: ${releaseId}`,
            });
            continue;
        }
        
        const html = generateEntryHtml(row, releaseId);
        const filePath = join(ENTRY_DIR, `${releaseId}.html`);
        writeFileSync(filePath, html, 'utf-8');
        
        generatedReleaseIds.push(releaseId);
        report.generated++;
    }
    
    console.log(`   Generated ${report.generated} pages\n`);
    
    // Generate sitemap
    console.log('🗺️  Generating sitemap.xml...');
    const sitemap = generateSitemap(generatedReleaseIds);
    writeFileSync(SITEMAP_PATH, sitemap, 'utf-8');
    console.log(`   Added ${generatedReleaseIds.length + 2} URLs to sitemap\n`);
    
    // Print report
    console.log('📊 Build Report:');
    console.log(`   Total CSV rows: ${report.totalRows}`);
    console.log(`   Pages generated: ${report.generated}`);
    console.log(`   Entries skipped: ${report.skipped.length}`);
    
    if (report.skipped.length > 0) {
        console.log('\n⚠️  Skipped entries:');
        for (const skip of report.skipped.slice(0, 10)) {
            console.log(`   - ${skip.artist} - ${skip.album}: ${skip.reason}`);
        }
        if (report.skipped.length > 10) {
            console.log(`   ... and ${report.skipped.length - 10} more`);
        }
    }
    
    console.log('\n✅ Build complete!');
}

// Run build
build();

