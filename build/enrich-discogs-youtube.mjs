#!/usr/bin/env node
/**
 * Discogs → YouTube enrichment (Discogs-only)
 *
 * Goal:
 * - For each CSV row, fetch the Discogs release and look at release.videos[]
 * - Pick the best YouTube video that matches the Track Title (exact composition)
 * - Cache results to build/youtube_map.json so rebuilds are fast
 *
 * Usage:
 *   DISCOGS_TOKEN="..." node build/enrich-discogs-youtube.mjs
 *
 * Options:
 *   --limit=200        Only process first N releases (useful for testing)
 *   --refresh          Ignore existing cached entries and refetch
 *   --min-score=0.65   Minimum score to accept a match (0..1)
 *   --delay-ms=1100    Delay between Discogs requests
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

const CSV_PATH = join(ROOT_DIR, "DrumBreaks.csv");
const OUT_PATH = join(ROOT_DIR, "build", "youtube_map.json");
const OVERRIDES_PATH = join(ROOT_DIR, "build", "youtube_overrides.json");

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;
const USER_AGENT =
  process.env.DISCOGS_USER_AGENT ||
  "OpenDrumsOnly/1.0 +https://www.opendrumsonly.com";

function parseArgs(argv) {
  const out = {
    limit: Infinity,
    refresh: false,
    minScore: 0.65,
    delayMs: 1100,
    saveEvery: 25,
    progressEvery: 25,
  };

  for (const a of argv) {
    if (a === "--refresh") out.refresh = true;
    if (a.startsWith("--limit=")) out.limit = Number(a.split("=")[1]);
    if (a.startsWith("--min-score=")) out.minScore = Number(a.split("=")[1]);
    if (a.startsWith("--delay-ms=")) out.delayMs = Number(a.split("=")[1]);
    if (a.startsWith("--save-every=")) out.saveEvery = Number(a.split("=")[1]);
    if (a.startsWith("--progress-every=")) out.progressEvery = Number(a.split("=")[1]);
  }

  if (!Number.isFinite(out.limit) || out.limit <= 0) out.limit = Infinity;
  if (!Number.isFinite(out.minScore)) out.minScore = 0.65;
  out.minScore = Math.max(0, Math.min(1, out.minScore));
  if (!Number.isFinite(out.delayMs) || out.delayMs < 0) out.delayMs = 1100;
  if (!Number.isFinite(out.saveEvery) || out.saveEvery <= 0) out.saveEvery = 25;
  if (!Number.isFinite(out.progressEvery) || out.progressEvery <= 0) out.progressEvery = 25;
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse CSV file (simple parser for this specific format)
 */
function parseCSV(csvText) {
  const lines = csvText.split("\n");
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
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
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function extractReleaseId(discogsUrl) {
  if (!discogsUrl || typeof discogsUrl !== "string") return null;
  const match = discogsUrl.match(/\/release\/(\d+)/);
  return match ? match[1] : null;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/&/g, " and ")
    .replace(/[\[\(].*?[\]\)]/g, " ") // remove bracketed noise
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s) {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "of",
    "to",
    "in",
    "on",
    "feat",
    "featuring",
    "ft",
    "official",
    "audio",
    "video",
    "remaster",
    "remastered",
    "mono",
    "stereo",
    "version",
    "edit",
    "mix",
    "live",
    "lyrics",
    "lyric",
  ]);
  const toks = normalize(s)
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !stop.has(t));
  return new Set(toks);
}

function jaccard(aSet, bSet) {
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

function scoreTitle({ videoTitle, artist, trackCandidates }) {
  const tNorm = normalize(videoTitle);
  const aNorm = normalize(artist);

  let bestTrackScore = 0;
  for (const cand of trackCandidates) {
    const cNorm = normalize(cand);
    if (!cNorm) continue;

    if (tNorm.includes(cNorm)) {
      bestTrackScore = Math.max(bestTrackScore, 1);
      continue;
    }

    const jt = jaccard(tokenSet(cNorm), tokenSet(tNorm));
    bestTrackScore = Math.max(bestTrackScore, jt);
  }

  let artistScore = 0;
  if (aNorm && tNorm.includes(aNorm)) artistScore = 1;
  else artistScore = jaccard(tokenSet(aNorm), tokenSet(tNorm));

  // Penalize titles that look like album/compilation uploads
  const penalties = [
    /\bfull\s+album\b/i,
    /\bside\s+[ab]\b/i,
    /\bplaylist\b/i,
    /\bmix\b/i,
    /\bcompilation\b/i,
  ];
  const penalty = penalties.some((r) => r.test(videoTitle)) ? 0.15 : 0;

  // Weight track much higher than artist (we care about exact composition)
  const score = 0.8 * bestTrackScore + 0.2 * artistScore - penalty;
  return Math.max(0, Math.min(1, score));
}

function extractYouTubeId(uri) {
  try {
    const u = new URL(uri);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");

      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];

      const vIdx = parts.indexOf("v");
      if (vIdx >= 0 && parts[vIdx + 1]) return parts[vIdx + 1];
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchDiscogsRelease(releaseId) {
  const url = `https://api.discogs.com/releases/${releaseId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: `Discogs token=${DISCOGS_TOKEN}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discogs ${releaseId} failed: ${res.status} ${text}`.trim());
  }
  return await res.json();
}

async function fetchDiscogsMaster(masterId) {
  const url = `https://api.discogs.com/masters/${masterId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: `Discogs token=${DISCOGS_TOKEN}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discogs master ${masterId} failed: ${res.status} ${text}`.trim());
  }
  return await res.json();
}

function splitTrackCandidates(trackField) {
  const raw = String(trackField || "").trim();
  if (!raw) return [];
  // CSV often contains multiple tracks separated by commas.
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!DISCOGS_TOKEN) {
    console.error(
      "Missing DISCOGS_TOKEN. Set it and rerun:\n  DISCOGS_TOKEN=\"...\" node build/enrich-discogs-youtube.mjs"
    );
    process.exit(1);
  }

  const csvText = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(csvText);

  const cache = readJson(OUT_PATH, {});
  const overrides = readJson(OVERRIDES_PATH, {});

  const runStartedAt = Date.now();
  const totalUnique = new Set(
    rows
      .map((r) => extractReleaseId(r["Discogs Release ID"]))
      .filter(Boolean)
  ).size;
  const plannedTotal = Number.isFinite(opts.limit)
    ? Math.min(opts.limit, totalUnique)
    : totalUnique;

  console.log("🔎 Discogs → YouTube enrichment (Discogs-only)");
  console.log(`- unique releases in CSV: ${totalUnique}`);
  console.log(`- processing limit: ${Number.isFinite(opts.limit) ? opts.limit : "none"} (planned: ${plannedTotal})`);
  console.log(`- min-score: ${opts.minScore}`);
  console.log(`- delay-ms: ${opts.delayMs}`);
  console.log(`- refresh: ${opts.refresh ? "yes" : "no"}`);
  console.log(`- cache: ${OUT_PATH}`);
  console.log(`- overrides: ${OVERRIDES_PATH}`);
  console.log("");

  const seen = new Set();
  let processed = 0;
  let fetched = 0;
  let fetchedMasters = 0;
  let matched = 0;
  let skippedNoTrack = 0;
  let skippedNoVideos = 0;
  let skippedNoVideosMaster = 0;
  let skippedLowScore = 0;
  let lowScoreAtLeast050 = 0;
  let lowScoreAtLeast040 = 0;
  let lowScoreAtLeast030 = 0;
  let errors = 0;
  let lastSaveFetched = 0;
  const masterVideosCache = new Map(); // masterId -> [{title, uri}]

  for (const row of rows) {
    if (processed >= opts.limit) break;

    const releaseId = extractReleaseId(row["Discogs Release ID"]);
    if (!releaseId) continue;
    if (seen.has(releaseId)) continue;
    seen.add(releaseId);

    processed++;

    // Overrides always win and do not require track.
    if (overrides && overrides[releaseId]) {
      const videoId = String(overrides[releaseId]).trim();
      if (videoId) {
        cache[releaseId] = {
          videoId,
          title: "override",
          uri: `https://www.youtube.com/watch?v=${videoId}`,
          score: 1,
          source: "override",
          updatedAt: new Date().toISOString(),
        };
        matched++;
      }
      continue;
    }

    const artist = row["Artist Name"] || "";
    const trackCandidates = splitTrackCandidates(row["Track Title"]);

    // Exact composition matching requires a track name.
    if (trackCandidates.length === 0) {
      skippedNoTrack++;
      continue;
    }

    if (!opts.refresh && cache[releaseId]?.videoId) {
      continue;
    }

    try {
      const release = await fetchDiscogsRelease(releaseId);
      fetched++;

      const toYtVideos = (videos) =>
        (Array.isArray(videos) ? videos : [])
          .map((v) => ({ title: v?.title || "", uri: v?.uri || "" }))
          .filter((v) => v.uri && extractYouTubeId(v.uri));

      let ytVideos = toYtVideos(release?.videos);

      // If a release has no YouTube videos, fall back to the Discogs master videos.
      // Many releases have sparse metadata but the master is richer.
      if (ytVideos.length === 0) {
        const masterId = release?.master_id;
        if (masterId) {
          const key = String(masterId);
          if (masterVideosCache.has(key)) {
            ytVideos = masterVideosCache.get(key);
          } else {
            try {
              const master = await fetchDiscogsMaster(key);
              fetchedMasters++;
              const mv = toYtVideos(master?.videos);
              masterVideosCache.set(key, mv);
              ytVideos = mv;
            } catch (e) {
              // Master fetch is a best-effort enhancement; treat as no master videos.
              masterVideosCache.set(key, []);
            }
          }
        }
      }

      if (ytVideos.length === 0) {
        // Distinguish between no release videos and also no master videos.
        if (release?.master_id) skippedNoVideosMaster++;
        else skippedNoVideos++;
        await sleep(opts.delayMs);
        if (fetched - lastSaveFetched >= opts.saveEvery) {
          writeFileSync(OUT_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
          lastSaveFetched = fetched;
        }
        if (processed % opts.progressEvery === 0) {
          const elapsedSec = (Date.now() - runStartedAt) / 1000;
          const rate = fetched > 0 ? fetched / elapsedSec : 0;
          const remaining = plannedTotal - processed;
          const etaSec = rate > 0 ? remaining / rate : Infinity;
          console.log(
            `[progress] processed=${processed}/${plannedTotal} fetched=${fetched} masters=${fetchedMasters} matched=${matched} noTrack=${skippedNoTrack} noVideos=${skippedNoVideos} noVideosMaster=${skippedNoVideosMaster} lowScore=${skippedLowScore} errors=${errors} ` +
              `rate=${rate.toFixed(2)}/s eta=${Number.isFinite(etaSec) ? Math.round(etaSec / 60) + "m" : "?"}`
          );
        }
        continue;
      }

      let best = null;
      for (const v of ytVideos) {
        const s = scoreTitle({
          videoTitle: v.title,
          artist,
          trackCandidates,
        });
        if (!best || s > best.score) best = { ...v, score: s };
      }

      if (!best || best.score < opts.minScore) {
        skippedLowScore++;
        if (best && typeof best.score === "number") {
          if (best.score >= 0.5) lowScoreAtLeast050++;
          if (best.score >= 0.4) lowScoreAtLeast040++;
          if (best.score >= 0.3) lowScoreAtLeast030++;
        }
        await sleep(opts.delayMs);
        if (fetched - lastSaveFetched >= opts.saveEvery) {
          writeFileSync(OUT_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
          lastSaveFetched = fetched;
        }
        if (processed % opts.progressEvery === 0) {
          const elapsedSec = (Date.now() - runStartedAt) / 1000;
          const rate = fetched > 0 ? fetched / elapsedSec : 0;
          const remaining = plannedTotal - processed;
          const etaSec = rate > 0 ? remaining / rate : Infinity;
          console.log(
            `[progress] processed=${processed}/${plannedTotal} fetched=${fetched} masters=${fetchedMasters} matched=${matched} noTrack=${skippedNoTrack} noVideos=${skippedNoVideos} noVideosMaster=${skippedNoVideosMaster} lowScore=${skippedLowScore} errors=${errors} ` +
              `rate=${rate.toFixed(2)}/s eta=${Number.isFinite(etaSec) ? Math.round(etaSec / 60) + "m" : "?"}`
          );
        }
        continue;
      }

      const videoId = extractYouTubeId(best.uri);
      if (!videoId) {
        skippedLowScore++;
        await sleep(opts.delayMs);
        continue;
      }

      cache[releaseId] = {
        videoId,
        title: best.title,
        uri: best.uri,
        score: Number(best.score.toFixed(3)),
        source: "discogs",
        updatedAt: new Date().toISOString(),
      };
      matched++;

      await sleep(opts.delayMs);

      if (fetched - lastSaveFetched >= opts.saveEvery) {
        writeFileSync(OUT_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
        lastSaveFetched = fetched;
      }
      if (processed % opts.progressEvery === 0) {
        const elapsedSec = (Date.now() - runStartedAt) / 1000;
        const rate = fetched > 0 ? fetched / elapsedSec : 0;
        const remaining = plannedTotal - processed;
        const etaSec = rate > 0 ? remaining / rate : Infinity;
        console.log(
          `[progress] processed=${processed}/${plannedTotal} fetched=${fetched} masters=${fetchedMasters} matched=${matched} noTrack=${skippedNoTrack} noVideos=${skippedNoVideos} noVideosMaster=${skippedNoVideosMaster} lowScore=${skippedLowScore} errors=${errors} ` +
            `rate=${rate.toFixed(2)}/s eta=${Number.isFinite(etaSec) ? Math.round(etaSec / 60) + "m" : "?"}`
        );
      }
    } catch (e) {
      errors++;
      // Avoid spewing huge logs; print a single line per error.
      console.error(`[error] ${releaseId}: ${e?.message || e}`);
      await sleep(opts.delayMs);

      if (fetched - lastSaveFetched >= opts.saveEvery) {
        writeFileSync(OUT_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
        lastSaveFetched = fetched;
      }
      if (processed % opts.progressEvery === 0) {
        const elapsedSec = (Date.now() - runStartedAt) / 1000;
        const rate = fetched > 0 ? fetched / elapsedSec : 0;
        const remaining = plannedTotal - processed;
        const etaSec = rate > 0 ? remaining / rate : Infinity;
        console.log(
          `[progress] processed=${processed}/${plannedTotal} fetched=${fetched} masters=${fetchedMasters} matched=${matched} noTrack=${skippedNoTrack} noVideos=${skippedNoVideos} noVideosMaster=${skippedNoVideosMaster} lowScore=${skippedLowScore} errors=${errors} ` +
            `rate=${rate.toFixed(2)}/s eta=${Number.isFinite(etaSec) ? Math.round(etaSec / 60) + "m" : "?"}`
        );
      }
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");

  console.log("\nDiscogs → YouTube enrichment complete:");
  console.log(`- processed: ${processed}`);
  console.log(`- fetched: ${fetched}`);
  console.log(`- fetched masters (fallback): ${fetchedMasters}`);
  console.log(`- matched (written/updated): ${matched}`);
  console.log(`- skipped (no track title): ${skippedNoTrack}`);
  console.log(`- skipped (no Discogs YT videos): ${skippedNoVideos}`);
  console.log(`- skipped (no master YT videos): ${skippedNoVideosMaster}`);
  console.log(`- skipped (low score): ${skippedLowScore}`);
  console.log(
    `  - low score but >=0.50: ${lowScoreAtLeast050} (>=0.40: ${lowScoreAtLeast040}, >=0.30: ${lowScoreAtLeast030})`
  );
  console.log(`- errors: ${errors}`);
  console.log(`\nWrote: ${OUT_PATH}`);
  if (!existsSync(OVERRIDES_PATH)) {
    console.log(`Tip: create overrides at ${OVERRIDES_PATH} (JSON: { "<releaseId>": "<videoId>" })`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


