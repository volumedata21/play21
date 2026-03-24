import { VideoFile, FolderStructure } from '../types';

export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'
];

export const formatViews = (count?: number): string => {
  // Simulate view counts if not provided
  const views = count !== undefined ? count : Math.floor(Math.random() * 900000) + 1000;
  if (views > 1000000) return `${(views / 1000000).toFixed(1)}M views`;
  if (views > 1000) return `${(views / 1000).toFixed(1)}K views`;
  return `${views} views`;
};

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatTimeAgo = (): string => {
  const days = Math.floor(Math.random() * 365);
  if (days === 0) return 'Today';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

export const processFiles = (fileList: FileList): { videos: VideoFile[], structure: FolderStructure } => {
  const videos: VideoFile[] = [];
  const structure: FolderStructure = {};

  Array.from(fileList).forEach((file) => {
    // Basic MIME type check or extension check
    // Note: 'video/x-matroska' (mkv) might not have a proper MIME type in some browsers, checking extension is safer fallback
    const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|ogg|mov|mkv)$/i);

    if (isVideo) {
      // Create a unique ID
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Determine folder path
      // webkitRelativePath is usually "RootFolder/SubFolder/File.mp4"
      const pathParts = file.webkitRelativePath.split('/');
      // If file is in root selection, folder is "Home", else it's the immediate parent
      let folder = 'Root';
      if (pathParts.length > 2) {
        folder = pathParts[pathParts.length - 2];
      } else if (pathParts.length === 2) {
        folder = pathParts[0]; 
      }

      // Generate random views and use file date
      const viewsCount = Math.floor(Math.random() * 5000); 
      const createdAt = file.lastModified;

      const videoFile: VideoFile = {
        id,
        name: file.name,
        path: file.webkitRelativePath,
        file,
        folder,
        url: URL.createObjectURL(file),
        viewsCount,
        views: formatViews(viewsCount),
        createdAt,
        timeAgo: 'Just added'
      };

      videos.push(videoFile);

      if (!structure[folder]) {
        structure[folder] = [];
      }
      structure[folder].push(videoFile);
    }
  });

  return { videos, structure };
};
