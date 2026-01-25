import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// 1. Setup Database
const db = new Database('localtube.db');

// Ensure database has a thumbnail column
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    folder TEXT,
    path TEXT NOT NULL,
    thumbnail TEXT, 
    created_at INTEGER,
    views INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0
  )
`);

// ---------------------------------------------------------
// THUMBNAIL LOGIC
// ---------------------------------------------------------
const mediaDir = path.join(process.cwd(), 'media');
const dataDir = path.join(process.cwd(), 'data');
const thumbnailsDir = path.join(dataDir, 'thumbnails');

// Ensure our storage folders exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir);

// Helper to check for existing images next to video
function findLocalThumbnail(videoPath) {
  const dir = path.dirname(videoPath);
  const name = path.parse(videoPath).name; // e.g. "MyVideo"
  
  // Expanded list of candidates
  const candidates = [
    path.join(dir, `${name}.jpg`),
    path.join(dir, `${name}.png`),
    path.join(dir, `${name}.webp`),       // Common for web
    path.join(dir, `${name}-thumb.jpg`),  // Your specific format
    path.join(dir, `${name}-thumbnail.jpg`),
    path.join(dir, 'thumbnail.jpg'),
    path.join(dir, 'thumb.jpg'),
    path.join(dir, 'cover.jpg')
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return null;
}

// Helper to generate a thumbnail using FFmpeg
function generateThumbnail(videoPath, videoId) {
  return new Promise((resolve) => {
    const outputFilename = `${videoId}.jpg`;
    const outputPath = path.join(thumbnailsDir, outputFilename);

    // If we already generated it previously, skip
    if (fs.existsSync(outputPath)) {
      return resolve(`/thumbnails/${outputFilename}`);
    }

    ffmpeg(videoPath)
      .on('end', () => {
        console.log(`Generated thumbnail for ${videoId}`);
        resolve(`/thumbnails/${outputFilename}`);
      })
      .on('error', (err) => {
        console.error(`Error generating thumbnail for ${videoId}:`, err);
        resolve(null);
      })
      .screenshots({
        timestamps: ['5'], 
        filename: outputFilename,
        folder: thumbnailsDir,
        size: '1280x720' // CHANGED FROM 640x360 TO 1280x720
      });
  });
}

// ---------------------------------------------------------
// RECURSIVE SCANNING
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
  if (!fs.existsSync(mediaDir)) {
    console.log('Media folder not found, creating...');
    fs.mkdirSync(mediaDir, { recursive: true });
    return;
  }

  console.log('Scanning media folder...');
  const files = getFilesRecursively(mediaDir);
  const supportedExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];

  const insertStmt = db.prepare(`
    INSERT INTO videos (id, name, filename, folder, path, thumbnail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
    thumbnail = excluded.thumbnail 
  `);

  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    if (!supportedExtensions.includes(ext)) continue;

    const relativePath = path.relative(mediaDir, fullPath);
    const folderName = path.dirname(relativePath) === '.' ? 'Local Library' : path.dirname(relativePath);
    
    // SAFETY FIX: Encode the URL parts so spaces/symbols don't break the image link
    const webPath = '/media/' + relativePath.split(path.sep).map(encodeURIComponent).join('/');
    
    const stats = fs.statSync(fullPath);
    
    // SAFETY FIX: Robust ID generation
    const id = `vid-${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // 1. Check for local thumbnail 
    let thumbUrl = null;
    const localThumbPath = findLocalThumbnail(fullPath);
    
    if (localThumbPath) {
      const relativeThumb = path.relative(mediaDir, localThumbPath);
      // SAFETY FIX: Encode this URL too
      thumbUrl = '/media/' + relativeThumb.split(path.sep).map(encodeURIComponent).join('/');
      console.log(`Found local thumbnail for ${path.basename(fullPath)}`);
    } else {
      // 2. If no local file, generate one
      thumbUrl = await generateThumbnail(fullPath, id);
    }

    insertStmt.run(
      id,
      path.basename(fullPath, ext),
      path.basename(fullPath),
      folderName,
      webPath,
      thumbUrl, 
      Math.floor(stats.birthtimeMs)
    );
  }
  console.log(`Scan complete.`);
}


// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------
app.use(express.json());

// Serve static files
app.use('/media', express.static(mediaDir));
app.use('/thumbnails', express.static(thumbnailsDir));

app.get('/api/videos', (req, res) => {
  const videos = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  
  const formatted = videos.map(v => ({
    ...v,
    isFavorite: Boolean(v.is_favorite),
    viewsCount: v.views,
    views: `${v.views} views`,
    timeAgo: new Date(v.created_at).toLocaleDateString(),
    thumbnail: v.thumbnail || null 
  }));
  
  res.json({ videos: formatted });
});

app.post('/api/scan', async (req, res) => {
  console.log("Manual scan triggered...");
  await scanMedia(); 
  res.json({ success: true, message: "Scan complete" });
});

// Run scan on startup
scanMedia();

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});