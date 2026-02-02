import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// ---------------------------------------------------------
// 1. DIRECTORY SETUP
// ---------------------------------------------------------
const mediaDir = process.env.MEDIA_DIR || path.join(process.cwd(), 'media');
const dataDir = path.join(process.cwd(), 'data');
const thumbnailsDir = path.join(dataDir, 'thumbnails');
const subsDir = path.join(dataDir, 'subtitles');

if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });
if (!fs.existsSync(subsDir)) fs.mkdirSync(subsDir, { recursive: true });

// ---------------------------------------------------------
// 2. DATABASE SETUP
// ---------------------------------------------------------
const db = new Database(path.join(dataDir, 'play21.db'));
db.pragma('journal_mode = WAL');

// Videos Table
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    folder TEXT,
    path TEXT NOT NULL,
    thumbnail TEXT, 
    subtitles TEXT,
    duration INTEGER,
    description TEXT,
    channel TEXT,
    channel_avatar TEXT,
    genre TEXT,
    release_date TEXT,
    playback_position INTEGER DEFAULT 0,
    created_at INTEGER,
    views INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    youtube_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_folder ON videos(folder);
  CREATE INDEX IF NOT EXISTS idx_created ON videos(created_at);

  CREATE INDEX IF NOT EXISTS idx_release_date ON videos(release_date);
  CREATE INDEX IF NOT EXISTS idx_views ON videos(views);
  CREATE INDEX IF NOT EXISTS idx_is_favorite ON videos(is_favorite);
`);

// Settings Table (NEW)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

// Playlists Table (NEW - Persists Playlists)
db.exec(`
  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER
  )
`);

// Playlist Videos Join Table (NEW - Links Videos to Playlists)
db.exec(`
  CREATE TABLE IF NOT EXISTS playlist_videos (
    playlist_id TEXT,
    video_id TEXT,
    added_at INTEGER,
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
  )
`);

// History Table (NEW - Persists Watch History)
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    video_id TEXT PRIMARY KEY,
    watched_at INTEGER,
    FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
  )
`);

// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------
// Helper to parse .nfo XML content manually (without extra libraries)
function parseNfo(nfoPath) {
  try {
    const content = fs.readFileSync(nfoPath, 'utf-8');

    const extract = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const match = content.match(regex);
      return match ? match[1].trim() : null;
    };

    // Simple XML entity decoder (turns &apos; into ' etc)
    const decode = (str) => {
      if (!str) return null;
      return str
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1') // Fix for titles wrapped in CDATA
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
        .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .trim(); // Removes accidental hidden spaces or new lines
    };

    return {
      title: decode(extract('title')),
      plot: decode(extract('plot')),
      channel: decode(extract('showtitle')),
      genre: decode(extract('genre')),
      aired: extract('aired'),
      youtubeId: extract('uniqueid') // NEW: Extract the ID
    };
  } catch (e) {
    return null;
  }
}

function findLocalThumbnail(videoPath) {
  const dir = path.dirname(videoPath);
  const name = path.parse(videoPath).name;
  const candidates = [
    path.join(dir, `${name}.jpg`),
    path.join(dir, `${name}.png`),
    path.join(dir, `${name}.webp`),
    path.join(dir, `${name}-thumb.jpg`),
    path.join(dir, 'thumbnail.jpg'),
    path.join(dir, 'cover.jpg')
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

// NEW: Recursive search for Channel Avatar (poster/avatar/channel.jpg)
function findChannelAvatar(startDir) {
  // path.resolve makes sure we have the full, "real" address on the disk
  let currentDir = path.resolve(startDir);
  const rootDir = path.resolve(mediaDir);

  // We loop upwards until we go past the media root
  while (currentDir.startsWith(mediaDir)) {
    try {
      const files = fs.readdirSync(currentDir);

      // Look for regex match: poster, avatar, channel (case insensitive) with valid extensions
      const match = files.find(f => /^(poster|avatar|channel|folder)\.(jpg|jpeg|png|webp)$/i.test(f));

      if (match) {
        // Found it! Convert full path to web URL
        const fullPath = path.join(currentDir, match);
        const relativePath = path.relative(mediaDir, fullPath);
        return '/media/' + relativePath.split(path.sep).map(encodeURIComponent).join('/');
      }
    } catch (e) {
      // Ignore errors (like permission issues)
    }

    // Move up one level
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break; // Reached system root (safety break)
    currentDir = parent;
  }
  return null;
}

function generateThumbnail(videoPath, videoId) {
  return new Promise((resolve) => {
    const outputFilename = `${videoId}.jpg`;
    const outputPath = path.join(thumbnailsDir, outputFilename);

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return resolve(`/thumbnails/${outputFilename}`);
    }

    ffmpeg(videoPath)
      .on('end', () => resolve(`/thumbnails/${outputFilename}`))
      .on('error', (err) => {
        console.error(`FFmpeg error for ${videoId}:`, err);
        resolve(null);
      })
      .screenshots({
        timestamps: ['10%'],
        filename: outputFilename,
        folder: thumbnailsDir,
        size: '?x720' 
      });
  });
}

// Helper to get video duration
function getVideoMetadata(path) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return resolve({ duration: 0, tags: {} });
      
      // FFmpeg normalizes most tags, but we default to empty object if missing
      const tags = data.format.tags || {};
      const duration = data.format.duration || 0;
      
      resolve({ duration, tags });
    });
  });
}

// Helper to format seconds to MM:SS
function formatDuration(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function processSubtitles(videoPath, videoId) {
  const dir = path.dirname(videoPath);
  const nameNoExt = path.parse(videoPath).name;

  const files = fs.readdirSync(dir);
  const subtitleFiles = files.filter(f =>
    f.startsWith(nameNoExt) && (f.endsWith('.srt') || f.endsWith('.vtt'))
  );

  const processedTracks = [];

  for (const file of subtitleFiles) {
    const parts = file.split('.');
    let lang = 'en';
    let label = 'English';

    if (parts.length > 2) {
      const possibleLang = parts[parts.length - 2];
      if (possibleLang.length === 2) {
        lang = possibleLang;
        label = possibleLang.toUpperCase();
      }
    }

    const sourcePath = path.join(dir, file);
    const isVtt = file.endsWith('.vtt');
    let webVttFilename = `${videoId}-${lang}.vtt`;
    let outputVttPath = path.join(subsDir, webVttFilename);

    try {
      if (isVtt) {
        fs.copyFileSync(sourcePath, outputVttPath);
      } else {
        if (!fs.existsSync(outputVttPath)) {
          await new Promise((resolve, reject) => {
            ffmpeg(sourcePath)
              .output(outputVttPath)
              .on('end', resolve)
              .on('error', reject)
              .run();
          });
        }
      }
      processedTracks.push({
        src: `/subtitles/${webVttFilename}`,
        lang: lang,
        label: label
      });
    } catch (err) {
      console.error(`Failed to process subtitle ${file}:`, err);
    }
  }

  return JSON.stringify(processedTracks);
}

// ---------------------------------------------------------
// SCANNING LOGIC
// ---------------------------------------------------------
function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

// GLOBAL STATE: prevent double scanning
// GLOBAL STATE: prevent double scanning
let isScanning = false;

async function scanMedia(forceRefresh = false) {
  if (isScanning) return;
  isScanning = true;
  console.log('Starting background scan...');

  try {
    const files = getFilesRecursively(mediaDir);
    const supportedExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];

    // Filter strictly for video files
    const validFiles = files.filter(fullPath =>
      supportedExtensions.includes(path.extname(fullPath).toLowerCase())
    );

    console.log(`Found ${validFiles.length} video files.`);

    // PREPARE STATEMENTS
    const checkStmt = db.prepare('SELECT id, duration FROM videos WHERE id = ?');

    // 1. FAST PASS: Insert files immediately so they appear in the UI
    const insertStmt = db.prepare(`
      INSERT INTO videos (id, name, filename, folder, path, created_at, release_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET path = excluded.path
    `);

    // 2. META PASS: Update metadata (slow)
    const updateMetaStmt = db.prepare(`
      UPDATE videos SET 
      duration = ?, thumbnail = ?, subtitles = ?, description = ?, 
      channel = ?, genre = ?, release_date = ?, channel_avatar = ?,
      name = ?, youtube_id = ?
      WHERE id = ?
    `);

    // --- PHASE 1: INSTANT INSERT (OPTIMIZED) ---
    // We wrap the loop in a transaction to prevent database locking and speed up inserts 100x
    const runPhase1 = db.transaction((filesToScan) => {
      for (const fullPath of filesToScan) {
        const relativePath = path.relative(mediaDir, fullPath);
        const id = `vid-${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const existing = checkStmt.get(id);
        if (!existing) {
          const folderName = path.dirname(relativePath) === '.' ? 'Local Library' : path.dirname(relativePath);
          const webPath = '/media/' + relativePath.split(path.sep).map(encodeURIComponent).join('/');
          const stats = fs.statSync(fullPath);
          const tempDate = new Date(stats.birthtimeMs).toISOString().split('T')[0];

          insertStmt.run(
            id,
            path.basename(fullPath, path.extname(fullPath)), 
            path.basename(fullPath), 
            folderName,
            webPath,
            Math.floor(stats.birthtimeMs),
            tempDate
          );
        }
      }
    });

    // Run the transaction
    runPhase1(validFiles);
    
    console.log("Phase 1 complete: Videos are visible in UI.");

    // --- PHASE 2: DEEP SCAN (Duration, Thumbs, NFO) ---
    for (const fullPath of validFiles) {
      const relativePath = path.relative(mediaDir, fullPath);
      const id = `vid-${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // CRITICAL CHECK: Skip if we have data AND we are NOT forcing a refresh
      const existing = checkStmt.get(id);
      if (!forceRefresh && existing && existing.duration) continue;

      try {
        // A. THUMBNAIL
        let thumbUrl = null;
        const existingThumb = db.prepare('SELECT thumbnail FROM videos WHERE id = ?').get(id);

        if (existingThumb && existingThumb.thumbnail) {
          thumbUrl = existingThumb.thumbnail;
        } else {
          const localThumb = findLocalThumbnail(fullPath);
          if (localThumb) {
            thumbUrl = '/media/' + path.relative(mediaDir, localThumb).split(path.sep).map(encodeURIComponent).join('/');
          } else {
            // Generate
            thumbUrl = await generateThumbnail(fullPath, id);
          }
        }

        // B. DURATION & METADATA
        const { duration, tags } = await getVideoMetadata(fullPath);

        // C. SUBTITLES
        const subtitlesJson = await processSubtitles(fullPath, id);

        const dir = path.dirname(fullPath);
        const baseName = path.parse(fullPath).name;
        
        // D. METADATA STRATEGY (Waterfall)
        // 1. Default to "smart" filename parsing
        const stats = fs.statSync(fullPath);
        const fileDate = new Date(stats.birthtimeMs).toISOString().split('T')[0];
        
        let meta = { 
            title: baseName, // Default to filename
            plot: null, 
            channel: "Local Library", 
            genre: null, 
            aired: fileDate,
            youtubeId: null
        };

        // 2. Override with Embedded Tags (if they exist)
        if (tags.title) meta.title = tags.title;
        if (tags.description || tags.comment || tags.synopsis) meta.plot = tags.description || tags.comment || tags.synopsis;
        if (tags.genre) meta.genre = tags.genre;
        if (tags.artist || tags.album_artist || tags.composer) meta.channel = tags.artist || tags.album_artist || tags.composer;
        if (tags.date || tags.creation_time) {
            const rawDate = tags.date || tags.creation_time;
            if (rawDate.includes('-')) meta.aired = rawDate.split('T')[0];
        }

        // 3. Override with NFO (Highest Priority)
        const filesInDir = fs.readdirSync(dir);
        const actualNfoFile = filesInDir.find(f =>
          f.toLowerCase() === `${baseName.toLowerCase()}.nfo`
        );
        const nfoPath = actualNfoFile ? path.join(dir, actualNfoFile) : null;

        if (fs.existsSync(nfoPath)) {
          const parsed = parseNfo(nfoPath);
          if (parsed) {
            if (parsed.title) meta.title = parsed.title;
            if (parsed.plot) meta.plot = parsed.plot;
            if (parsed.channel) meta.channel = parsed.channel;
            if (parsed.genre) meta.genre = parsed.genre;
            if (parsed.aired) meta.aired = parsed.aired.split(' ')[0];
            if (parsed.youtubeId) meta.youtubeId = parsed.youtubeId;
          }
        }

        // E. CHANNEL AVATAR
        const channelAvatarUrl = findChannelAvatar(path.dirname(fullPath));

        // UPDATE RECORD
        updateMetaStmt.run(
          Math.floor(duration),
          thumbUrl,
          subtitlesJson,
          meta.plot,
          meta.channel,
          meta.genre,
          meta.aired,
          channelAvatarUrl,
          meta.title,
          meta.youtubeId || null,
          id
        );

      } catch (e) {
        console.error(`Failed to process metadata for ${id}`, e);
      }
    } // <--- This correctly closes the 'for' loop now

    console.log(`Deep scan complete.`);
  } catch (e) {
    console.error("Scan failed:", e);
  } finally {
    isScanning = false;
  }
}

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------
app.use(express.json({ limit: '50mb' }));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH'],
}));

app.use('/media', express.static(mediaDir));
app.use('/thumbnails', express.static(thumbnailsDir));
app.use('/subtitles', express.static(subsDir));

// Get 7 completely random videos from the entire library
app.get('/api/discovery/random', (req, res) => {
  try {
    const { hideHidden } = req.query;
    
    // Default base query
    let sql = 'SELECT * FROM videos';

    // Apply the filter if requested
    if (hideHidden === 'true') {
      sql += " WHERE filename NOT LIKE '.%'";
    }

    // Add the randomization and limit
    sql += ' ORDER BY RANDOM() LIMIT 7';

    const randomVideos = db.prepare(sql).all();
    res.json({ success: true, videos: randomVideos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- VIDEOS (Paginated) ---
app.get('/api/videos', (req, res) => {
  const { page, limit, folder, sort, search, hideHidden, favorites, history, playlist } = req.query; // Added 'playlist'
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let orderBy = 'release_date DESC';
  
  // Standard Sorts
  if (sort === 'Name (A-Z)') orderBy = 'name ASC';
  if (sort === 'Name (Z-A)') orderBy = 'name DESC';
  if (sort === 'Date Added (Newest)') orderBy = 'created_at DESC';
  if (sort === 'Date Added (Oldest)') orderBy = 'created_at ASC';
  if (sort === 'Air Date (Newest)') orderBy = 'release_date DESC';
  if (sort === 'Air Date (Oldest)') orderBy = 'release_date ASC';

  let countQuery = 'SELECT COUNT(*) as total FROM videos';
  let queryStr = 'SELECT videos.* FROM videos';
  let whereClause = '';
  let params = [];
  const conditions = [];

  // --- 1. FILTER LOGIC ---
  if (playlist) {
    // JOIN allows us to only fetch videos linked to this playlist
    queryStr = 'SELECT videos.*, playlist_videos.added_at FROM videos JOIN playlist_videos ON videos.id = playlist_videos.video_id';
    countQuery = 'SELECT COUNT(*) as total FROM videos JOIN playlist_videos ON videos.id = playlist_videos.video_id';
    
    conditions.push('playlist_videos.playlist_id = ?');
    params.push(playlist);
    
    // Override sort to show most recently added to playlist first
    orderBy = 'playlist_videos.added_at DESC';
  } 
  else if (history === 'true') {
    queryStr = 'SELECT videos.*, history.watched_at FROM videos JOIN history ON videos.id = history.video_id';
    countQuery = 'SELECT COUNT(*) as total FROM videos JOIN history ON videos.id = history.video_id';
    orderBy = 'history.watched_at DESC';
  }
  else {
    // Standard filters only apply if NOT in history/playlist mode
    if (hideHidden === 'true') {
      // Robust hidden check (Files AND Folders)
      conditions.push("(filename NOT LIKE '.%' AND folder NOT LIKE '.%' AND folder NOT LIKE '%/.%')");
    }
    if (favorites === 'true') conditions.push('is_favorite = 1');
    if (folder) {
        conditions.push('(folder = ? OR folder LIKE ?)');
        params.push(folder, `${folder}/%`);
    }
  }

  // --- 2. SEARCH (Applies to all views) ---
  if (search) {
    const tokens = search.trim().split(/\s+/);
    tokens.forEach(token => {
        conditions.push('(name LIKE ? OR channel LIKE ?)'); 
        params.push(`%${token}%`, `%${token}%`);
    });
  }

  if (conditions.length > 0) whereClause = ' WHERE ' + conditions.join(' AND ');

  const finalQuery = `${queryStr} ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const finalCountQuery = `${countQuery} ${whereClause}`;

  try {
    const totalObj = db.prepare(finalCountQuery).get(...params);
    const total = totalObj ? totalObj.total : 0;

    const videos = db.prepare(finalQuery).all(...params, limit, offset);

    // Format output
    const formatted = videos.map(v => ({
      ...v,
      isFavorite: Boolean(v.is_favorite),
      views: `${v.views} views`,
      timeAgo: v.release_date 
        ? new Date(v.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
        : new Date(v.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      durationStr: formatDuration(v.duration),
    }));

    res.json({
      videos: formatted,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Database error" });
  }
});

// --- GET SINGLE VIDEO METADATA (CRITICAL FOR DIRECT LINKING) ---
app.get('/api/videos/:id', (req, res) => {
  try {
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: "Video not found" });

    // Format it exactly like the list endpoint
    const formatted = {
      ...video,
      isFavorite: Boolean(video.is_favorite),
      viewsCount: video.views,
      views: `${video.views} views`,
      timeAgo: video.release_date 
  ? new Date(video.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  : new Date(video.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      thumbnail: video.thumbnail || null,
      durationStr: formatDuration(video.duration),
      channelAvatar: video.channel_avatar,
      // Ensure path is exposed for the frontend player
      path: video.path
    };

    res.json(formatted);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Database error" });
  }
});

// --- STREAMING ROUTE (ASYNC / NON-BLOCKING) ---
app.get('/api/stream/:id', async (req, res) => {
  try {
    const video = db.prepare('SELECT path FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).send('Not found');

    // Handle both absolute paths and relative /media/ paths
    let fullPath = video.path;
    if (video.path.startsWith('/media')) {
      const relPath = decodeURIComponent(video.path.replace(/^\/media\//, ''));
      fullPath = path.join(mediaDir, relPath);
    }

    // CRITICAL FIX: Use Async check to prevent server freezing during playback
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
    } catch (e) {
      return res.status(404).send('File missing');
    }

    const stat = await fs.promises.stat(fullPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(fullPath, { start, end });
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (err) {
    console.error("Stream error:", err);
    if (!res.headersSent) res.status(500).send('Stream Error');
  }
});

// NEW: Toggle Favorite (Persist to DB)
app.post('/api/videos/:id/favorite', (req, res) => {
  const { id } = req.params;
  const { isFavorite } = req.body;
  db.prepare('UPDATE videos SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, id);
  res.json({ success: true });
});

// Increment View Count
app.post('/api/videos/:id/view', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) {
    console.error("Failed to increment view", e);
    res.status(500).json({ error: "Failed to update views" });
  }
});

// NEW: Save Playback Progress
app.post('/api/videos/:id/progress', (req, res) => {
  const { id } = req.params;
  const { time } = req.body;
  try {
    db.prepare('UPDATE videos SET playback_position = ? WHERE id = ?').run(Math.floor(time), id);
    res.json({ success: true });
  } catch (e) {
    console.error("Failed to save progress", e);
    res.status(500).json({ error: "Failed to save progress" });
  }
});

// --- THUMBNAILS (Custom Save/Remove) ---
app.post('/api/videos/:id/thumbnail', (req, res) => {
  const { id } = req.params;
  const { image } = req.body;

  if (!image) return res.status(400).json({ error: "No image data" });

  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${id}-custom.jpg`;
    const filepath = path.join(thumbnailsDir, filename);
    fs.writeFileSync(filepath, buffer);

    const webPath = `/thumbnails/${filename}`;
    db.prepare('UPDATE videos SET thumbnail = ? WHERE id = ?').run(webPath, id);

    res.json({ success: true, thumbnail: webPath });
  } catch (e) {
    console.error("Failed to save thumbnail", e);
    res.status(500).json({ error: "Failed to save" });
  }
});

app.delete('/api/videos/:id/thumbnail', async (req, res) => {
  const { id } = req.params;
  try {
    const customPath = path.join(thumbnailsDir, `${id}-custom.jpg`);
    if (fs.existsSync(customPath)) fs.unlinkSync(customPath);

    const video = db.prepare('SELECT path FROM videos WHERE id = ?').get(id);
    if (!video) return res.status(404).json({ error: "Video not found" });

    const relPath = decodeURIComponent(video.path.replace(/^\/media\//, ''));
    const fullPath = path.join(mediaDir, relPath);

    let newThumbUrl = null;
    const localThumbPath = findLocalThumbnail(fullPath);
    if (localThumbPath) {
      const relativeThumb = path.relative(mediaDir, localThumbPath);
      newThumbUrl = '/media/' + relativeThumb.split(path.sep).map(encodeURIComponent).join('/');
    } else {
      newThumbUrl = await generateThumbnail(fullPath, id);
    }

    db.prepare('UPDATE videos SET thumbnail = ? WHERE id = ?').run(newThumbUrl, id);
    res.json({ success: true, thumbnail: newThumbUrl });

  } catch (e) {
    console.error("Failed to remove thumbnail", e);
    res.status(500).json({ error: "Failed to remove" });
  }
});

// --- HISTORY (NEW) ---
app.get('/api/history', (req, res) => {
  const history = db.prepare('SELECT video_id FROM history ORDER BY watched_at DESC').all();
  res.json({ history: history.map(h => h.video_id) });
});

app.post('/api/history', (req, res) => {
  const { videoId } = req.body;
  db.prepare(`
        INSERT INTO history (video_id, watched_at) VALUES (?, ?)
        ON CONFLICT(video_id) DO UPDATE SET watched_at = excluded.watched_at
    `).run(videoId, Date.now());
  res.json({ success: true });
});

// --- PLAYLISTS (NEW) ---
app.get('/api/playlists', (req, res) => {
  const playlists = db.prepare('SELECT * FROM playlists ORDER BY created_at DESC').all();
  const result = playlists.map(p => {
    const videos = db.prepare('SELECT video_id FROM playlist_videos WHERE playlist_id = ? ORDER BY added_at ASC').all(p.id);
    return {
      id: p.id,
      name: p.name,
      videoIds: videos.map(v => v.video_id)
    };
  });
  res.json({ playlists: result });
});

app.post('/api/playlists', (req, res) => {
  const { name } = req.body;
  const id = `pl-${Date.now()}`;
  db.prepare('INSERT INTO playlists (id, name, created_at) VALUES (?, ?, ?)').run(id, name, Date.now());
  res.json({ success: true, playlist: { id, name, videoIds: [] } });
});

app.post('/api/playlists/:id/videos', (req, res) => {
  const { id } = req.params;
  const { videoId } = req.body;
  try {
    db.prepare('INSERT INTO playlist_videos (playlist_id, video_id, added_at) VALUES (?, ?, ?)').run(id, videoId, Date.now());
    res.json({ success: true });
  } catch (e) {
    // Ignore duplicate inserts
    res.json({ success: true });
  }
});

// --- FOLDERS ENDPOINT (File System Scan for Images) ---
app.get('/api/folders', (req, res) => {
  const parent = req.query.parent || '';
  // Check specifically in the media directory
  const dirPath = parent ? path.join(mediaDir, parent) : mediaDir;

  if (!fs.existsSync(dirPath)) return res.json({ folders: [] });

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    const folders = items
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const folderName = dirent.name;
        const fullFolderPath = path.join(dirPath, folderName);
        
        // List of image names we want to look for
        const imageNames = ['folder.jpg', 'poster.jpg', 'channel.jpg', 'cover.jpg', 'fanart.jpg', 'folder.png', 'logo.png'];
        let foundImage = null;

        try {
          const filesInFolder = fs.readdirSync(fullFolderPath);
          // Case-insensitive match
          const match = imageNames.find(img => filesInFolder.map(f => f.toLowerCase()).includes(img));
          
          if (match) {
            // Create a URL for the frontend
            const safeParent = parent ? parent.split('/').map(encodeURIComponent).join('/') : '';
            foundImage = `/api/stream/${encodeURIComponent(folderName)}/${match}?folderContext=${safeParent}`;
          }
        } catch (e) {
          // Ignore permission errors
        }

        return {
          name: folderName,
          image: foundImage
        };
      });

    res.json({ folders });
  } catch (e) {
    console.error("Folder scan error:", e);
    res.json({ folders: [] });
  }
});

// --- HELPER: Serve the Folder Images ---
app.get('/api/stream/:folder/:image', (req, res) => {
    const folder = decodeURIComponent(req.params.folder);
    const image = req.params.image;
    const parent = req.query.folderContext ? decodeURIComponent(req.query.folderContext) : '';
    
    // Construct path to the image on disk
    const imagePath = path.join(mediaDir, parent, folder, image);
    
    if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
    } else {
        res.status(404).send('Not found');
    }
});

// Remove a video from a specific playlist
app.delete('/api/playlists/:playlistId/videos/:videoId', (req, res) => {
  const { playlistId, videoId } = req.params;
  try {
    db.prepare('DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?')
      .run(playlistId, videoId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove video" });
  }
});

// --- SETTINGS (NEW) ---
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
  res.json({ success: true });
});

// --- HARDWARE TRANSCODING ROUTE (New) ---
app.get('/api/transcode/:id', (req, res) => {
  const video = db.prepare('SELECT path FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).send('Not found');

  let fullPath = video.path;
  if (video.path.startsWith('/media')) {
    const relPath = decodeURIComponent(video.path.replace(/^\/media\//, ''));
    fullPath = path.join(mediaDir, relPath);
  }

  // Basic headers for a video stream
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Connection': 'keep-alive',
  });

  // THE MAGIC: FFmpeg with Intel QSV Hardware Acceleration
  const command = ffmpeg(fullPath)
    // 1. Hardware Decode Options
    // This tells FFmpeg to use the QSV device and keep frames in GPU memory (zero-copy)
    .inputOptions([
      '-init_hw_device qsv=hw:/dev/dri/renderD128',
      '-hwaccel qsv',
      '-hwaccel_output_format qsv',
      '-noautorotate',
      '-vf scale_qsv=format=nv12'
    ])
    // 2. Hardware Encode Options
    .outputOptions([
      '-c:v h264_qsv',        // Use Intel QuickSync Encoder (crucial!)
      '-preset ultrafast',    // Prioritize speed for streaming
      '-global_quality 23',   // QSV uses global_quality, not -crf (lower = better quality)
      '-look_ahead 0',        // Reduces buffer latency
      '-c:a aac',             // Audio is still done on CPU (it's cheap)
      '-b:a 128k',
      '-movflags frag_keyframe+empty_moov', // Required for streaming MP4
      '-f mp4'
    ])
    .on('error', (err) => {
      // Ignore the error if it's just the client disconnecting
      if (err.message !== 'Output stream closed') {
        console.error('Transcoding error:', err);
      }
    });

  // CRITICAL FIX: Kill FFmpeg if the user closes the tab or skips video
  res.on('close', () => {
    command.kill();
  });

  command.pipe(res, { end: true });
});

  // --- MANUAL SCAN ROUTE ---
app.post('/api/scan', (req, res) => {
  if (isScanning) {
    return res.status(409).json({ error: "Scan already in progress" });
  }
  
  // Check if frontend asked for a 'full' scan
  const isFullScan = req.body.type === 'full';
  
  // Run in background
  scanMedia(isFullScan);
  
  res.json({ success: true, message: isFullScan ? "Full scan started" : "Quick scan started" });
});

// --- GRACEFUL SHUTDOWN ---
const cleanup = () => {
  console.log('Closing database connection...');
  db.close();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Run scan on startup
scanMedia();

const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Server running on http://0.0.0.0:${PORT}`);
});