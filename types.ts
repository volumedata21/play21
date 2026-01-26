export interface VideoFile {
  id: string;
  name: string;
  path: string; // Relative path from root
  file?: File; // Optional for mock data
  folder: string;
  url: string;
  thumbnail?: string;
  
  // --- SUBTITLE SUPPORT ---
  subtitles?: {
    src: string;
    lang: string;
    label: string;
  }[];
  // ------------------------

  // NEW METADATA FIELDS ---
  channel?: string;
  genre?: string;
  releaseDate?: string;

  duration?: number;
  durationStr?: string; // Pre-formatted for mocks
  views?: string; // Pre-formatted for mocks
  viewsCount?: number; // Numeric views for sorting
  timeAgo?: string; // Pre-formatted for mocks
  createdAt?: number; // Timestamp for sorting
  description?: string; // Static description
  isFavorite?: boolean;
}

export interface FolderStructure {
  [folderName: string]: VideoFile[];
}

export interface Playlist {
  id: string;
  name: string;
  videoIds: string[];
}

export enum ViewState {
  HOME = 'HOME',
  WATCH = 'WATCH',
  FAVORITES = 'FAVORITES',
  HISTORY = 'HISTORY',
  PLAYLIST = 'PLAYLIST'
}

export interface AIMetadata {
  description: string;
  tags: string[];
  comments: {
    user: string;
    text: string;
    likes: number;
  }[];
}

export enum SortOption {
  DATE_NEWEST = 'Date Added (Newest)',
  DATE_OLDEST = 'Date Added (Oldest)',
  NAME_ASC = 'Name (A-Z)',
  NAME_DESC = 'Name (Z-A)',
  VIEWS_MOST = 'Most Viewed',
  VIEWS_LEAST = 'Least Viewed',
  DURATION_LONGEST = 'Duration (Longest)',
  DURATION_SHORTEST = 'Duration (Shortest)',
}