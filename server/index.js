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

// Added 'subtitles' column (TEXT type to store JSON string)
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

const mediaDir = path.join(process.cwd(), 'media');
const dataDir = path.join(process.cwd(), 'data');
const thumbnailsDir = path.join(dataDir, 'thumbnails');
// New: Folder for converted subtitles
const subsDir = path.join(dataDir, 'subtitles');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir);
if (!fs.existsSync(subsDir)) fs.mkdirSync(subsDir);

// ---------------------------------------------------------
// SUBTITLE LOGIC (NEW)
// ---------------------------------------------------------
async function processSubtitles(videoPath, videoId) {
  const dir = path.dirname(videoPath);
  const nameNoExt = path.parse(videoPath).name;
  
  // Find all files in the directory that start with the video name
  const files = fs.readdirSync(dir);
  const subtitleFiles = files.filter(f => 
    f.startsWith(nameNoExt) && (f.endsWith('.srt') || f.endsWith('.vtt'))
  );

  const processedTracks = [];

  for (const file of subtitleFiles) {
    // Determine language from filename (e.g. "Movie.en.srt" -> "en")
    // If no lang found, default to "Default"
    const parts = file.split('.');
    let lang = 'en';
    let label = 'English';
    
    // Simple heuristic: if filename has 3 parts "Name.en.srt", middle is lang
    if (parts.length > 2) {
      const possibleLang = parts[parts.length - 2];
      if (possibleLang.length === 2) {
        lang = possibleLang;
        label = possibleLang.toUpperCase();
      }
    }

    const sourcePath = path.join(dir, file);
    const isVtt = file.endsWith('.vtt');
    
    // We need a web-accessible VTT file. 
    // If it's already VTT, we just link it. If SRT, we convert it.
    let webVttFilename = `${videoId}-${lang}.vtt`;
    let outputVttPath = path.join(subsDir, webVttFilename);

    try {
      if (isVtt) {
        // It's already VTT, just copy it to our data folder to be safe/consistent
        fs.copyFileSync(sourcePath, outputVttPath);
      } else {
        // It's SRT, convert to VTT using FFmpeg
        if (!fs.existsSync(outputVttPath)) {
            await new Promise((resolve, reject) => {
                ffmpeg(sourcePath)
                .output(outputVttPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
            });
            console.log(`Converted subtitle: ${file} -> ${webVttFilename}`);
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
// THUMBNAIL LOGIC
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
      .on('error', () => resolve(null))
      .screenshots({
        timestamps: ['10%'], 
        filename: outputFilename,
        folder: thumbnailsDir,
        size: '1280x720'
      });
  });
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
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
    return;
  }

  console.log('Scanning media folder...');
  const files = getFilesRecursively(mediaDir);
  const supportedExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];

  const insertStmt = db.prepare(`
    INSERT INTO videos (id, name, filename, folder, path, thumbnail, subtitles, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
    thumbnail = excluded.thumbnail,
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

    // 1. Thumbnails
    let thumbUrl = null;
    const localThumbPath = findLocalThumbnail(fullPath);
    if (localThumbPath) {
      const relativeThumb = path.relative(mediaDir, localThumbPath);
      thumbUrl = '/media/' + relativeThumb.split(path.sep).map(encodeURIComponent).join('/');
    } else {
      thumbUrl = await generateThumbnail(fullPath, id);
    }

    // 2. Subtitles (New!)
    const subtitlesJson = await processSubtitles(fullPath, id);

    insertStmt.run(
      id,
      path.basename(fullPath, ext),
      path.basename(fullPath),
      folderName,
      webPath,
      thumbUrl, 
      subtitlesJson, // Store the JSON string
      Math.floor(stats.birthtimeMs)
    );
  }
  console.log(`Scan complete.`);
}

// ---------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------
app.use(express.json());
app.use('/media', express.static(mediaDir));
app.use('/thumbnails', express.static(thumbnailsDir));
// Serve the converted subtitles
app.use('/subtitles', express.static(subsDir));

app.get('/api/videos', (req, res) => {
  const videos = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  
  const formatted = videos.map(v => ({
    ...v,
    isFavorite: Boolean(v.is_favorite),
    viewsCount: v.views,
    views: `${v.views} views`,
    timeAgo: new Date(v.created_at).toLocaleDateString(),
    thumbnail: v.thumbnail || null,
    // Parse the JSON string back into an object
    subtitles: v.subtitles ? JSON.parse(v.subtitles) : [] 
  }));
  
  res.json({ videos: formatted });
});

app.post('/api/scan', async (req, res) => {
  console.log("Manual scan triggered...");
  await scanMedia(); 
  res.json({ success: true, message: "Scan complete" });
});

scanMedia();

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});