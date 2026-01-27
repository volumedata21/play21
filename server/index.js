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
    is_favorite INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_folder ON videos(folder);
  CREATE INDEX IF NOT EXISTS idx_created ON videos(created_at);
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
      // This looks for the tag, but ignores any hidden spaces or weird characters inside the tag itself
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
      aired: extract('aired') // Keep date as string
    };
  } catch (e) {
    return null; // No NFO or read error
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
        size: '1280x720'
      });
  });
}

// Helper to get video duration
function getVideoDuration(path) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(path, (err, metadata) => {
      if (err) return resolve(0);
      resolve(metadata.format.duration || 0);
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
let isScanning = false;

async function scanMedia() {
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
      name = ?
      WHERE id = ?
    `);

    // --- PHASE 1: INSTANT INSERT ---
    for (const fullPath of validFiles) {
      const relativePath = path.relative(mediaDir, fullPath);
      // Create ID from path
      const id = `vid-${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

      const existing = checkStmt.get(id);
      if (!existing) {
        const folderName = path.dirname(relativePath) === '.' ? 'Local Library' : path.dirname(relativePath);
        const webPath = '/media/' + relativePath.split(path.sep).map(encodeURIComponent).join('/');
        const stats = fs.statSync(fullPath);
        const tempDate = new Date(stats.birthtimeMs).toISOString().split('T')[0];

        // Insert with bare minimum data
        insertStmt.run(
          id,
          path.basename(fullPath, path.extname(fullPath)), // Display Name
          path.basename(fullPath), // Filename
          folderName,
          webPath,
          Math.floor(stats.birthtimeMs),
          tempDate
        );
      }
    }
    console.log("Phase 1 complete: Videos are visible in UI.");

    // --- PHASE 2: DEEP SCAN (Duration, Thumbs, NFO) ---
    for (const fullPath of validFiles) {
      const relativePath = path.relative(mediaDir, fullPath);
      const id = `vid-${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Skip if we already have a duration (means we likely scanned it before)
      const existing = checkStmt.get(id);
      if (existing && existing.duration) continue;

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

        // B. DURATION
        const duration = await getVideoDuration(fullPath);

        // C. SUBTITLES
        const subtitlesJson = await processSubtitles(fullPath, id);

        // D. NFO METADATA
        const dir = path.dirname(fullPath);
        const baseName = path.parse(fullPath).name;
        const filesInDir = fs.readdirSync(dir);

        // This looks through the folder and finds a file that matches 
        // the name regardless of BIG or small letters
        const actualNfoFile = filesInDir.find(f =>
          f.toLowerCase() === `${baseName.toLowerCase()}.nfo`
        );

        const nfoPath = actualNfoFile ? path.join(dir, actualNfoFile) : null;
        const stats = fs.statSync(fullPath);
        const fileDate = new Date(stats.birthtimeMs).toISOString().split('T')[0];
        let meta = { plot: null, channel: null, genre: null, aired: fileDate }; // Default to file date 

        if (fs.existsSync(nfoPath)) {
          const parsed = parseNfo(nfoPath);
          if (parsed) {
            meta = {
              ...parsed,
              // Use NFO date if it exists, otherwise use the file date 
              aired: parsed.aired ? parsed.aired.split(' ')[0] : fileDate
            };
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
          meta.channel || "Local Library",
          meta.genre,
          meta.aired,
          channelAvatarUrl,
          meta.title || path.basename(fullPath, path.extname(fullPath)),
          id
        );

      } catch (e) {
        console.error(`Failed to process metadata for ${id}`, e);
      }
    }
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

// --- VIDEOS (Paginated) ---
app.get('/api/videos', (req, res) => {
  const { page, limit, folder, sort } = req.query; // Get 'sort' from the request
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let orderBy = 'release_date DESC'; // Default

  // Map the frontend SortOption to SQL commands
  if (sort === 'Name (A-Z)') orderBy = 'name ASC';
  if (sort === 'Name (Z-A)') orderBy = 'name DESC';
  if (sort === 'Date Added (Newest)') orderBy = 'created_at DESC';
  if (sort === 'Date Added (Oldest)') orderBy = 'created_at ASC';
  if (sort === 'Air Date (Newest)') orderBy = 'release_date DESC';
  if (sort === 'Air Date (Oldest)') orderBy = 'release_date ASC';

  let countQuery = 'SELECT COUNT(*) as total FROM videos';
  let whereClause = '';
  let params = [];

  // 1. Build the Filter (Where)
  if (folder) {
    whereClause = ' WHERE folder = ? OR folder LIKE ?';
    countQuery += whereClause;
    params = [folder, `${folder}/%`];
  }

  // 2. Build the Final Query (Using the 'orderBy' we set above)
  const query = `SELECT * FROM videos ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

  try {
    const totalObj = db.prepare(countQuery).get(...params);
    const total = totalObj ? totalObj.total : 0;

    const videos = db.prepare(query).all(...params, limit, offset);

    const formatted = videos.map(v => ({
      ...v,
      isFavorite: Boolean(v.is_favorite),
      viewsCount: v.views,
      views: `${v.views} views`,
      timeAgo: v.release_date
        ? new Date(v.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
        : new Date(v.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      thumbnail: v.thumbnail || null,
      durationStr: formatDuration(v.duration),
      duration: v.duration,
      playbackPosition: v.playback_position || 0,
      channelAvatar: v.channel_avatar
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

// --- STREAMING ROUTE ---
app.get('/api/stream/:id', (req, res) => {
  const video = db.prepare('SELECT path FROM videos WHERE id = ?').get(req.params.id);
  if (!video) return res.status(404).send('Not found');

  // Convert web path back to file system path
  let fullPath = video.path;
  if (video.path.startsWith('/media')) {
    const relPath = decodeURIComponent(video.path.replace(/^\/media\//, ''));
    fullPath = path.join(mediaDir, relPath);
  }

  // --- FIX: Check if file exists inside the route ---
  if (!fs.existsSync(fullPath)) {
    console.log(`File missing: ${fullPath}. Removing from DB.`);
    try {
      db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
    } catch (e) {
      console.error("Failed to remove ghost file from DB", e);
    }
    return res.status(404).send('File not found on disk');
  }

  // This handles the "Range" header automatically
  res.sendFile(fullPath);
});

app.post('/api/scan', async (req, res) => {
  console.log("Manual scan triggered...");
  await scanMedia();
  res.json({ success: true, message: "Scan complete" });
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

// --- NEW: FOLDERS ENDPOINT ---
// --- FOLDERS ENDPOINT (Recursive) ---
app.get('/api/folders', (req, res) => {
  const parent = req.query.parent;

  try {
    // If parent is provided, look for direct children: "Movies/Action" -> "Action"
    // If no parent, look for roots: "Movies"
    let query = 'SELECT DISTINCT folder FROM videos';
    let params = [];

    if (parent) {
      query += ' WHERE folder LIKE ?';
      params = [`${parent}/%`];
    }

    const allFolders = db.prepare(query).all(...params);

    const results = new Set();
    allFolders.forEach(row => {
      if (!row.folder) return;

      // LOGIC:
      // If we are in "Movies", and we find "Movies/Action/90s", 
      // we only want to show "Action", not "Action/90s".
      let relevantPart = row.folder;
      if (parent) {
        // Strip the parent prefix ("Movies/")
        relevantPart = relevantPart.substring(parent.length + 1);
      }

      // Take the first segment
      const root = relevantPart.split(/[/\\]/)[0];
      if (root) results.add(root);
    });

    res.json({ folders: Array.from(results).sort() });
  } catch (e) {
    console.error("Folder fetch failed", e);
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

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