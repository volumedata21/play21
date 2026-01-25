import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// ---------------------------------------------------------
// 1. DIRECTORY SETUP
// ---------------------------------------------------------
const mediaDir = path.join(process.cwd(), 'media');
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
    created_at INTEGER,
    views INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0
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

async function scanMedia() {
  console.log('Scanning media folder...');
  const files = getFilesRecursively(mediaDir);
  const supportedExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];

  const insertStmt = db.prepare(`
    INSERT INTO videos (id, name, filename, folder, path, thumbnail, subtitles, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
    subtitles = excluded.subtitles
  `);

  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    if (!supportedExtensions.includes(ext)) continue;

    const relativePath = path.relative(mediaDir, fullPath);
    const folderName = path.dirname(relativePath) === '.' ? 'Local Library' : path.dirname(relativePath);
    const webPath = '/media/' + relativePath.split(path.sep).map(encodeURIComponent).join('/');
    const stats = fs.statSync(fullPath);
    const id = `vid-${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const existing = db.prepare('SELECT thumbnail FROM videos WHERE id = ?').get(id);
    let thumbUrl = existing ? existing.thumbnail : null;

    if (!thumbUrl) {
        const localThumbPath = findLocalThumbnail(fullPath);
        if (localThumbPath) {
            const relativeThumb = path.relative(mediaDir, localThumbPath);
            thumbUrl = '/media/' + relativeThumb.split(path.sep).map(encodeURIComponent).join('/');
        } else {
            thumbUrl = await generateThumbnail(fullPath, id);
        }
    }

    const subtitlesJson = await processSubtitles(fullPath, id);

    insertStmt.run(
      id,
      path.basename(fullPath, ext),
      path.basename(fullPath),
      folderName,
      webPath,
      thumbUrl, 
      subtitlesJson, 
      Math.floor(stats.birthtimeMs)
    );
  }
  console.log(`Scan complete.`);
}

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------
app.use(express.json({ limit: '50mb' }));

app.use('/media', express.static(mediaDir));
app.use('/thumbnails', express.static(thumbnailsDir));
app.use('/subtitles', express.static(subsDir));

// --- VIDEOS ---
app.get('/api/videos', (req, res) => {
  const videos = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  
  const formatted = videos.map(v => ({
    ...v,
    isFavorite: Boolean(v.is_favorite),
    viewsCount: v.views,
    views: `${v.views} views`,
    timeAgo: new Date(v.created_at).toLocaleDateString(),
    thumbnail: v.thumbnail || null,
    subtitles: v.subtitles ? JSON.parse(v.subtitles) : [] 
  }));
  
  res.json({ videos: formatted });
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

// Run scan on startup
scanMedia();

// --- THUMBNAILS (Custom Save/Remove) ---
app.post('/api/videos/:id/thumbnail', (req, res) => {
    const { id } = req.params;
    const { image } = req.body;

    if (!image) return res.status(400).json({ error: "No image data" });

    try {
        // Strip the data:image/jpeg;base64, part to get raw data
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Save as vid-xyz-custom.jpg in the persistent /data folder
        const filename = `${id}-custom.jpg`;
        const filepath = path.join(thumbnailsDir, filename);
        fs.writeFileSync(filepath, buffer);

        // Save the WEB path (relative) to the database
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
        // 1. Delete custom file if it exists
        const customPath = path.join(thumbnailsDir, `${id}-custom.jpg`);
        if (fs.existsSync(customPath)) fs.unlinkSync(customPath);

        // 2. Find the original video file to fallback to the auto-generated one
        const video = db.prepare('SELECT path FROM videos WHERE id = ?').get(id);
        if (!video) return res.status(404).json({ error: "Video not found" });

        const relPath = decodeURIComponent(video.path.replace(/^\/media\//, ''));
        const fullPath = path.join(mediaDir, relPath);

        let newThumbUrl = null;
        
        // Check for local file (cover.jpg etc)
        const localThumbPath = findLocalThumbnail(fullPath);
        if (localThumbPath) {
             const relativeThumb = path.relative(mediaDir, localThumbPath);
             newThumbUrl = '/media/' + relativeThumb.split(path.sep).map(encodeURIComponent).join('/');
        } else {
             // Fallback to generated ID.jpg
             newThumbUrl = await generateThumbnail(fullPath, id);
        }

        // 3. Update DB
        db.prepare('UPDATE videos SET thumbnail = ? WHERE id = ?').run(newThumbUrl, id);
        res.json({ success: true, thumbnail: newThumbUrl });

    } catch (e) {
        console.error("Failed to remove thumbnail", e);
        res.status(500).json({ error: "Failed to remove" });
    }
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});