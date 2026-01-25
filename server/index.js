import express from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// 1. Setup Database
// We store the DB file in the /app directory so it persists if you mount a volume there
const db = new Database('localtube.db');

// Create the videos table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    folder TEXT,
    path TEXT NOT NULL,
    created_at INTEGER,
    views INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0
  )
`);

// 2. RECURSIVE File Scanning Logic
const mediaDir = path.join(process.cwd(), 'media');

// Helper function to find files recursively
function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      // Dive into the subfolder
      results = results.concat(getFilesRecursively(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

function scanMedia() {
  if (!fs.existsSync(mediaDir)) {
    console.log('Media folder not found, creating...');
    fs.mkdirSync(mediaDir, { recursive: true });
    return;
  }

  console.log('Scanning media folder...');
  const files = getFilesRecursively(mediaDir);
  const supportedExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO videos (id, name, filename, folder, path, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  files.forEach((fullPath, index) => {
    const ext = path.extname(fullPath).toLowerCase();
    if (!supportedExtensions.includes(ext)) return;

    // Calculate folder name relative to the media root
    // e.g. "Action Movies" or "TV Shows/Season 1"
    const relativePath = path.relative(mediaDir, fullPath);
    const folderName = path.dirname(relativePath) === '.' ? 'Local Library' : path.dirname(relativePath);
    
    // Create a web-accessible URL path
    // We encodeURIComponent to handle spaces/symbols in URLs safely
    const webPath = '/media/' + relativePath.split(path.sep).map(encodeURIComponent).join('/');

    const stats = fs.statSync(fullPath);
    const id = `vid-${relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`; // Safe ID

    insertStmt.run(
      id,
      path.basename(fullPath, ext), // Name without extension
      path.basename(fullPath),      // Filename
      folderName,                   // The subfolder name
      webPath,                      // The URL path
      Math.floor(stats.birthtimeMs)
    );
  });
  console.log(`Scan complete. Found ${files.length} files.`);
}

// Run scan on startup
scanMedia();

// 3. API Endpoints
app.use(express.json());

// Get all videos
app.get('/api/videos', (req, res) => {
  const videos = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  
  // Convert 1/0 integers back to booleans for the frontend
  const formatted = videos.map(v => ({
    ...v,
    isFavorite: Boolean(v.is_favorite),
    viewsCount: v.views,
    views: `${v.views} views`, // Formatting for frontend
    duration: 0, // Placeholder as we can't easily read duration backend-side without ffmpeg
    timeAgo: new Date(v.created_at).toLocaleDateString()
  }));
  
  res.json({ videos: formatted });
});

// Increment view count
app.post('/api/videos/:id/view', (req, res) => {
  db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// TRIGGER RESCAN
app.post('/api/scan', (req, res) => {
  console.log("Manual scan triggered...");
  scanMedia(); // Rerun the scan function
  res.json({ success: true, message: "Scan complete" });
});

// Toggle Favorite
app.post('/api/videos/:id/favorite', (req, res) => {
  const current = db.prepare('SELECT is_favorite FROM videos WHERE id = ?').get(req.params.id);
  const newVal = current.is_favorite ? 0 : 1;
  db.prepare('UPDATE videos SET is_favorite = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ success: true, isFavorite: Boolean(newVal) });
});

// Serve the media files directly
app.use('/media', express.static(mediaDir));

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});