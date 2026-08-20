(function () {
  'use strict';

  const MAX_OCR_EDGE = 1280;
  const MIN_SCORE = 18;
  const STRONG_SCORE = 55;
  const AMBIGUOUS_GAP = 12;
  const MAX_HITS = 5;
  const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

  const STOP = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'vinyl', 'record', 'records',
    'stereo', 'mono', 'side', 'disc', 'disk', 'album', 'track', 'feat', 'featuring',
    'vol', 'volume', 'inc', 'ltd', 'limited', 'company', 'corp', 'corporation',
    'music', 'productions', 'production', 'entertainment', 'label', 'band', 'group',
    'all', 'rights', 'reserved', 'copyright', 'made', 'printed', 'usa', 'england',
    'germany', 'japan', 'rpm', 'inch', 'name', 'completely', 'foobar', 'unknown',
    'people', 'love', 'good', 'time', 'you', 'your', 'are', 'was', 'were', 'his',
    'her', 'their', 'have', 'has', 'had', 'not', 'but', 'out', 'new', 'one', 'two',
    'up', 'go', 'man', 'big', 'hot', 'red', 'blue', 'get', 'got', 'let', 'can',
    'if', 'to', 'its', 'it', 'of', 'on', 'or', 'as', 'at', 'be', 'by', 'do', 'an', 'my'
  ]);

  const state = {
    stream: null,
    facingMode: 'environment',
    catalogue: [],
    tokenIndex: new Map(),
    tokenDf: new Map(),
    catalogueReady: null,
    ocrReady: null,
    tesseract: null,
    worker: null,
    busy: false,
    shots: [],
    fusedText: '',
    barcodeTexts: [],
    awaitingSecond: false,
    cameraOk: false
  };

  const els = {
    video: document.getElementById('scan-video'),
    canvas: document.getElementById('scan-canvas'),
    fallback: document.getElementById('scan-fallback'),
    status: document.getElementById('scan-status'),
    hint: document.getElementById('scan-hint'),
    shutter: document.getElementById('scan-shutter'),
    pickFile: document.getElementById('scan-pick-file'),
    file: document.getElementById('scan-file'),
    flip: document.getElementById('scan-flip'),
    results: document.getElementById('scan-results'),
    resultsTitle: document.getElementById('scan-results-title'),
    resultsSub: document.getElementById('scan-results-sub'),
    resultsBody: document.getElementById('scan-results-body'),
    resultsActions: document.getElementById('scan-results-actions'),
    closeResults: document.getElementById('scan-close-results'),
    previewStrip: document.getElementById('scan-preview-strip')
  };

  function showStatus(text) {
    els.status.textContent = text || '';
    els.status.classList.toggle('is-visible', Boolean(text));
  }

  function extractReleaseId(discogsUrl) {
    if (!discogsUrl) return '';
    const match = String(discogsUrl).match(/\/release\/(\d+)/i);
    return match ? match[1] : '';
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(value) {
    const tokens = normalizeText(value).split(' ').filter(Boolean);
    const out = [];
    for (const token of tokens) {
      if (token.length < 2) continue;
      if (STOP.has(token)) continue;
      if (/^\d{1,2}$/.test(token)) continue;
      out.push(token);
      // Keep compact forms for catalog-ish tokens: abc123, stx1001
      if (/^[a-z]+\d+[a-z0-9]*$/i.test(token) || /^\d+[a-z]+$/i.test(token)) {
        out.push(token.replace(/[^a-z0-9]/g, ''));
      }
    }
    return out;
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function buildCatalogue(rows) {
    const catalogue = [];
    const tokenIndex = new Map();
    const tokenDf = new Map();

    rows.forEach((row, idx) => {
      const artist = row['Artist Name'] || '';
      const album = row['Album Title'] || '';
      const track = row['Track Title'] || '';
      const label = row['Record Label'] || '';
      const year = row['Year'] || '';
      const tag = row['Tag'] || '';
      const discogsUrl = row['Discogs Release ID'] || '';
      const id = extractReleaseId(discogsUrl);
      if (!artist && !album) return;

      const searchBlob = [artist, album, track, label, year, id].join(' ');
      const tokens = unique(tokenize(searchBlob));
      const entry = {
        idx,
        artist,
        album,
        track,
        label,
        year,
        tag,
        discogsUrl,
        id,
        tokens,
        tokenSet: new Set(tokens),
        artistTokens: unique(tokenize(artist)),
        albumTokens: unique(tokenize(album)),
        trackTokens: unique(tokenize(track)),
        labelTokens: unique(tokenize(label))
      };
      catalogue.push(entry);

      for (const token of tokens) {
        let bucket = tokenIndex.get(token);
        if (!bucket) {
          bucket = [];
          tokenIndex.set(token, bucket);
        }
        bucket.push(catalogue.length - 1);
        tokenDf.set(token, (tokenDf.get(token) || 0) + 1);
      }
    });

    state.catalogue = catalogue;
    state.tokenIndex = tokenIndex;
    state.tokenDf = tokenDf;
  }

  function loadCatalogue() {
    if (state.catalogueReady) return state.catalogueReady;
    state.catalogueReady = fetch('./DrumBreaks.csv', { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load catalogue');
        return res.text();
      })
      .then((csvText) => new Promise((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            try {
              buildCatalogue(result.data || []);
              resolve(state.catalogue);
            } catch (err) {
              reject(err);
            }
          },
          error: reject
        });
      }))
      .catch((err) => {
        console.error(err);
        showStatus('Catalogue failed to load');
        throw err;
      });
    return state.catalogueReady;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-src="${src}"]`);
      if (existing) {
        if (window.Tesseract) resolve(window.Tesseract);
        else existing.addEventListener('load', () => resolve(window.Tesseract));
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => reject(new Error('Failed to load OCR engine'));
      document.head.appendChild(script);
    });
  }

  async function ensureOcr() {
    if (state.worker) return state.worker;
    if (state.ocrReady) return state.ocrReady;
    state.ocrReady = (async () => {
      const Tesseract = await loadScript(TESSERACT_CDN);
      state.tesseract = Tesseract;
      const worker = await Tesseract.createWorker('eng', 1, {
        // Keep defaults; worker runs off main thread.
      });
      // Favor accuracy on label/back text; still fast on downscaled stills.
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1'
      });
      state.worker = worker;
      return worker;
    })().catch((err) => {
      state.ocrReady = null;
      throw err;
    });
    return state.ocrReady;
  }

  // Warm OCR in the background after first paint — never blocks shutter.
  function warmOcr() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        ensureOcr().catch(() => {});
      }, { timeout: 2500 });
    } else {
      setTimeout(() => {
        ensureOcr().catch(() => {});
      }, 1200);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraFallback(true);
      return;
    }

    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      state.stream = stream;
      state.cameraOk = true;
      els.video.srcObject = stream;
      await els.video.play().catch(() => {});
      setCameraFallback(false);
      els.flip.disabled = false;
    } catch (err) {
      console.warn('Camera blocked or unavailable', err);
      state.cameraOk = false;
      setCameraFallback(true);
      els.flip.disabled = true;
    }
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }
    els.video.srcObject = null;
  }

  function setCameraFallback(show) {
    els.fallback.hidden = !show;
    els.fallback.classList.toggle('is-visible', show);
    if (show) {
      els.hint.textContent = 'Use the photo button — iPhone will open the camera.';
    } else {
      els.hint.textContent = 'One clear photo is enough.';
    }
  }

  function downscaleForOcr(source) {
    const srcW = source.videoWidth || source.naturalWidth || source.width;
    const srcH = source.videoHeight || source.naturalHeight || source.height;
    if (!srcW || !srcH) throw new Error('Empty image');

    const scale = Math.min(1, MAX_OCR_EDGE / Math.max(srcW, srcH));
    const dw = Math.max(1, Math.round(srcW * scale));
    const dh = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, dw, dh);
    return canvas;
  }

  function captureFromVideo() {
    const video = els.video;
    if (!video.videoWidth) throw new Error('Camera not ready');
    const canvas = els.canvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(video, 0, 0);
    return canvas;
  }

  function canvasToDataUrl(canvas) {
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function detectBarcodes(canvas) {
    if (typeof BarcodeDetector === 'undefined') return [];
    try {
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf']
      });
      const codes = await detector.detect(canvas);
      return (codes || [])
        .map((c) => (c.rawValue || '').trim())
        .filter(Boolean);
    } catch (err) {
      console.warn('BarcodeDetector failed', err);
      return [];
    }
  }

  async function runOcr(canvas) {
    const worker = await ensureOcr();
    const { data } = await worker.recognize(canvas);
    return (data && data.text) ? data.text : '';
  }

  function idfWeight(token) {
    const df = state.tokenDf.get(token) || 0;
    if (!df) return 0;
    const n = Math.max(1, state.catalogue.length);
    // Rare tokens (artist names, catalog-ish) outweigh generic words.
    return Math.log(1 + n / df);
  }

  function scoreEntry(entry, queryTokens, querySet, barcodeSet) {
    let score = 0;
    let matched = 0;
    let rareMatched = 0;

    for (const token of queryTokens) {
      if (entry.tokenSet.has(token)) {
        matched += 1;
        const w = idfWeight(token);
        score += w * (token.length >= 5 ? 2.2 : 1.4);
        if (w >= 4) rareMatched += 1;
      }
    }

    const artistHits = entry.artistTokens.filter((t) => querySet.has(t));
    const albumHits = entry.albumTokens.filter((t) => querySet.has(t));
    const trackHits = entry.trackTokens.filter((t) => querySet.has(t));
    const labelHits = entry.labelTokens.filter((t) => querySet.has(t));

    const artistCoverage = entry.artistTokens.length
      ? artistHits.length / entry.artistTokens.length
      : 0;
    const albumCoverage = entry.albumTokens.length
      ? albumHits.length / entry.albumTokens.length
      : 0;
    const trackCoverage = entry.trackTokens.length
      ? trackHits.length / entry.trackTokens.length
      : 0;

    score += artistHits.reduce((sum, t) => sum + idfWeight(t) * 3.2, 0);
    score += albumHits.reduce((sum, t) => sum + idfWeight(t) * 3.0, 0);
    score += trackHits.reduce((sum, t) => sum + idfWeight(t) * 2.4, 0);
    score += labelHits.reduce((sum, t) => sum + idfWeight(t) * 1.6, 0);

    if (artistCoverage >= 0.66 && artistHits.length >= 1) score += 8;
    if (albumCoverage >= 0.5 && albumHits.length >= 1) score += 8;
    if (trackCoverage >= 0.5 && trackHits.length >= 1) score += 6;

    if (entry.year && querySet.has(String(entry.year))) score += 2;
    if (entry.id && querySet.has(entry.id)) score += 24;

    for (const code of barcodeSet) {
      if (entry.tokenSet.has(code) || entry.id === code) score += 14;
    }

    // Hard gate: never invent a hit from generic leftover words.
    const distinctiveCore = [...artistHits, ...albumHits, ...trackHits]
      .some((t) => t.length >= 4 || idfWeight(t) >= 4.5);

    const hasCore =
      (
        artistHits.length >= 1 &&
        (albumHits.length >= 1 || trackHits.length >= 1) &&
        distinctiveCore &&
        matched >= 2
      ) ||
      (artistHits.length >= 2 && distinctiveCore) ||
      (albumHits.length >= 2 && artistHits.length >= 1 && distinctiveCore) ||
      (entry.id && querySet.has(entry.id)) ||
      (rareMatched >= 3);

    if (!hasCore) return 0;
    if (matched < 2 && score < STRONG_SCORE) return 0;

    return score;
  }

  function matchCatalogue(ocrText, barcodeValues) {
    const queryTokens = unique([
      ...tokenize(ocrText),
      ...barcodeValues.flatMap((v) => tokenize(v)),
      ...barcodeValues.map((v) => normalizeText(v).replace(/\s+/g, ''))
    ].filter(Boolean));

    if (!queryTokens.length) return [];

    const querySet = new Set(queryTokens);
    const barcodeSet = new Set(
      barcodeValues.map((v) => normalizeText(v).replace(/\s+/g, '')).filter(Boolean)
    );

    // Prefer rarer tokens when gathering candidates (cuts popular-word noise).
    const rankedQuery = queryTokens
      .slice()
      .sort((a, b) => idfWeight(b) - idfWeight(a));

    const candidateScores = new Map();
    for (const token of rankedQuery) {
      const bucket = state.tokenIndex.get(token);
      if (!bucket) continue;
      // Skip extremely common tokens for candidate generation.
      if ((state.tokenDf.get(token) || 0) > state.catalogue.length * 0.08) continue;
      const boost = idfWeight(token);
      for (const idx of bucket) {
        candidateScores.set(idx, (candidateScores.get(idx) || 0) + boost);
      }
    }

    let candidateIdxs = Array.from(candidateScores.keys());
    if (candidateIdxs.length > 600) {
      candidateIdxs = candidateIdxs
        .sort((a, b) => candidateScores.get(b) - candidateScores.get(a))
        .slice(0, 600);
    }
    if (!candidateIdxs.length) return [];

    const scored = [];
    for (const idx of candidateIdxs) {
      const entry = state.catalogue[idx];
      const score = scoreEntry(entry, queryTokens, querySet, barcodeSet);
      if (score >= MIN_SCORE) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.entry.artist.localeCompare(b.entry.artist));

    const seen = new Set();
    const hits = [];
    for (const item of scored) {
      const key = item.entry.id || `${item.entry.artist}|${item.entry.album}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(item);
      if (hits.length >= MAX_HITS) break;
    }
    return hits;
  }

  function classifyResult(hits) {
    if (!hits.length) {
      return { kind: 'miss', inconclusive: true };
    }
    const top = hits[0].score;
    const second = hits[1] ? hits[1].score : 0;
    const strong = top >= STRONG_SCORE;
    const ambiguous = hits.length > 1 && (top - second) <= AMBIGUOUS_GAP && top < STRONG_SCORE + 8;
    const weak = top < STRONG_SCORE;

    if (strong && !ambiguous) {
      return { kind: 'hit', inconclusive: false };
    }
    if (weak || ambiguous) {
      return { kind: 'weak', inconclusive: true };
    }
    return { kind: 'hit', inconclusive: false };
  }

  function confidenceLabel(score) {
    if (score >= 120) return 'High confidence';
    if (score >= STRONG_SCORE) return 'Good match';
    if (score >= 30) return 'Possible match';
    return 'Low confidence';
  }

  function coverUrl(entry) {
    const expected = `${entry.artist}-${entry.album}.jpeg`;
    return `./images/${encodeURIComponent(expected)}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPreviews() {
    if (!state.shots.length) {
      els.previewStrip.hidden = true;
      els.previewStrip.innerHTML = '';
      return;
    }
    els.previewStrip.hidden = false;
    els.previewStrip.innerHTML = state.shots
      .map((s) => `<img src="${s.previewUrl}" alt="photo preview">`)
      .join('');
  }

  function openResults() {
    els.results.hidden = false;
    els.results.classList.add('is-open');
  }

  function closeResults() {
    els.results.hidden = true;
    els.results.classList.remove('is-open');
  }

  function renderResults(hits, meta) {
    const { inconclusive, kind } = meta;
    renderPreviews();

    if (!hits.length) {
      els.resultsTitle.textContent = 'Not in OpenDrumsOnly';
      els.resultsSub.textContent = kind === 'miss'
        ? 'No catalogue match from this photo.'
        : '';
      els.resultsBody.innerHTML = `
        <div class="scan-empty">
          <h3>Not in OpenDrumsOnly</h3>
          <p>We could not match this photo to anything in the catalogue. That usually means it is not listed — or the text was too hard to read.</p>
        </div>
      `;
    } else {
      els.resultsTitle.textContent = hits.length === 1 ? 'Match' : 'Top matches';
      els.resultsSub.textContent = inconclusive
        ? 'Not sure yet — a second photo can help.'
        : 'In the OpenDrumsOnly catalogue.';

      els.resultsBody.innerHTML = `<ul class="scan-hit-list">${hits.map(({ entry, score }) => {
        const href = entry.id ? `./entry/${entry.id}.html` : (entry.discogsUrl || '#');
        const year = entry.year ? escapeHtml(entry.year) : '';
        const tag = entry.tag ? escapeHtml(entry.tag) : '';
        const metaBits = [year, tag].filter(Boolean).join(' · ');
        return `
          <li>
            <a class="scan-hit" href="${escapeHtml(href)}">
              <img src="${escapeHtml(coverUrl(entry))}" alt=""
                   loading="lazy"
                   onerror="this.onerror=null;this.src='./images/NotFound.jpeg';">
              <div class="scan-hit-body">
                <div class="scan-hit-artist">${escapeHtml(entry.artist)}</div>
                <div class="scan-hit-title">${escapeHtml(entry.album || entry.track || 'Untitled')}</div>
                <div class="scan-hit-meta">${metaBits}</div>
                <div class="scan-hit-conf">${confidenceLabel(score)}</div>
              </div>
            </a>
          </li>
        `;
      }).join('')}</ul>`;
    }

    const actions = [];
    if (inconclusive && state.shots.length < 2) {
      actions.push(`
        <div class="scan-second-prompt">
          <p>Still unsure. Try another photo with more light.</p>
          <div class="scan-second-actions">
            <button type="button" class="scan-action-btn primary" data-action="second-shot">Take another photo</button>
            <button type="button" class="scan-action-btn ghost" data-action="done">Done</button>
          </div>
        </div>
      `);
    }

    actions.push(`
      <div class="scan-results-actions">
        <button type="button" class="scan-action-btn primary" data-action="rescan">Scan another</button>
        <a class="scan-action-btn ghost" href="index.html" style="display:inline-flex;align-items:center;text-decoration:none;">Gallery</a>
      </div>
    `);

    els.resultsActions.innerHTML = actions.join('');
    openResults();
  }

  async function processImageSource(source, previewUrl) {
    state.busy = true;
    els.shutter.disabled = true;
    showStatus('Looking…');

    try {
      await loadCatalogue();

      const ocrCanvas = downscaleForOcr(source);

      // Barcode fast path on the full still — feed into matcher.
      const barcodes = await detectBarcodes(ocrCanvas);

      // OCR can start while user already has the still; engine may still be loading.
      showStatus('Looking…');
      const ocrText = await runOcr(ocrCanvas);

      const preview = previewUrl || canvasToDataUrl(ocrCanvas);
      state.shots.push({
        previewUrl: preview,
        text: ocrText,
        barcodes
      });
      state.barcodeTexts = unique(state.shots.flatMap((s) => s.barcodes));
      state.fusedText = state.shots.map((s) => s.text).join('\n');

      const hits = matchCatalogue(state.fusedText, state.barcodeTexts);
      const meta = classifyResult(hits);
      showStatus('');
      renderResults(hits, meta);
    } catch (err) {
      console.error(err);
      showStatus('Scan failed — try again');
      els.resultsTitle.textContent = 'Scan failed';
      els.resultsSub.textContent = 'Something went wrong reading that photo.';
      els.resultsBody.innerHTML = `
        <div class="scan-empty">
          <h3>Could not read photo</h3>
          <p>${escapeHtml(err.message || 'Unknown error')}. Try again with more light, or pick a clearer image.</p>
        </div>
      `;
      els.resultsActions.innerHTML = `
        <div class="scan-results-actions">
          <button type="button" class="scan-action-btn primary" data-action="rescan">Try again</button>
        </div>
      `;
      openResults();
    } finally {
      state.busy = false;
      els.shutter.disabled = false;
    }
  }

  async function onShutter() {
    if (state.busy) return;
    closeResults();

    if (state.cameraOk && els.video.srcObject && els.video.videoWidth) {
      try {
        const frame = captureFromVideo();
        const previewUrl = canvasToDataUrl(frame);
        await processImageSource(frame, previewUrl);
        return;
      } catch (err) {
        console.warn(err);
      }
    }
    // Fallback: native camera / file picker
    els.file.click();
  }

  function resetScan(keepCamera) {
    state.shots = [];
    state.fusedText = '';
    state.barcodeTexts = [];
    state.awaitingSecond = false;
    closeResults();
    showStatus('');
    renderPreviews();
    if (!keepCamera && !state.cameraOk) {
      startCamera();
    }
  }

  function onSecondShot() {
    state.awaitingSecond = true;
    closeResults();
    showStatus('Take another photo');
  }

  function onFileChosen(file) {
    if (!file || state.busy) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        await processImageSource(img, url);
      } finally {
        // Keep object URL for preview strip; revoke later on rescan.
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showStatus('Could not open image');
    };
    img.src = url;
  }

  function bindEvents() {
    els.shutter.addEventListener('click', onShutter);
    els.pickFile.addEventListener('click', () => els.file.click());
    els.file.addEventListener('change', () => {
      const file = els.file.files && els.file.files[0];
      els.file.value = '';
      if (file) onFileChosen(file);
    });

    els.flip.addEventListener('click', async () => {
      state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
      await startCamera();
    });

    els.closeResults.addEventListener('click', () => {
      resetScan(true);
    });

    els.resultsActions.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'second-shot') {
        onSecondShot();
      } else if (action === 'rescan' || action === 'done') {
        state.shots.forEach((s) => {
          if (s.previewUrl && s.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(s.previewUrl);
          }
        });
        resetScan(true);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopCamera();
      } else if (!els.results.classList.contains('is-open')) {
        startCamera();
      }
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('SW registration failed', err);
      });
    });
  }

  async function init() {
    bindEvents();
    registerServiceWorker();
    loadCatalogue().catch(() => {});
    warmOcr();
    await startCamera();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
