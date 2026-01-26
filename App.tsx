import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VideoFile, Playlist } from '../types';
import { 
  LikeIcon, ShareIcon, CameraIcon, StarIcon, StepBackIcon, StepForwardIcon, 
  PlaylistPlusIcon, NextVideoIcon, PrevVideoIcon, SpeedIcon, CCIcon, 
  DownloadIcon, LinkIcon 
} from './Icons';
import { formatViews, formatTimeAgo } from '../services/fileService';

// Internal Icon Components
const VolumeIcon = ({ level }: { level: number }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {level === 0 ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    )}
  </svg>
);

const FullscreenIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
);

const PlayIcon = () => (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
);

const PauseIcon = () => (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
);

interface VideoPlayerProps {
  video: VideoFile;
  relatedVideos: VideoFile[];
  playlists: Playlist[];
  hasNext: boolean;
  hasPrev: boolean;
  onVideoSelect: (video: VideoFile) => void;
  onUpdateVideo: (video: VideoFile) => void;
  onAddToPlaylist: (videoId: string, playlistId: string) => void;
  onNextVideo: () => void;
  onPrevVideo: () => void;
  onCreatePlaylist: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
    video, 
    relatedVideos, 
    playlists,
    hasNext,
    hasPrev,
    onVideoSelect, 
    onUpdateVideo,
    onAddToPlaylist,
    onNextVideo,
    onPrevVideo,
    onCreatePlaylist
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [showControls, setShowControls] = useState(true);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Reset state when video changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(true);
    // If the browser blocks autoplay, isPlaying might be wrong, but onPlay/onPause handles that
  }, [video.id]);

  // Format time (e.g., 90 -> 1:30)
  const formatTime = (seconds: number) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // --- KEYBOARD SHORTCUTS & CONTROLS ---

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, []);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }, []);

  const handleVolumeChange = (newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    setVolume(clamped);
    if (videoRef.current) videoRef.current.volume = clamped;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      if (videoRef.current) videoRef.current.currentTime = time;
  };

  // Show controls on mouse move, hide after 2s
  const handleMouseMove = () => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
          if (isPlaying) setShowControls(false);
      }, 2500);
  };

  // Keyboard Event Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      switch(e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullScreen();
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime += 5;
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          if (videoRef.current) videoRef.current.currentTime -= 5;
          break;
        case 'arrowup':
          e.preventDefault();
          handleVolumeChange(volume + 0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          handleVolumeChange(volume - 0.1);
          break;
        case 'm':
            handleVolumeChange(volume === 0 ? 1 : 0);
            break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleFullScreen, volume]);

  const captureThumbnail = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 640; 
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      onUpdateVideo({ ...video, thumbnail: dataUrl });
    }
  };

  const stepFrame = (forward: boolean) => {
    if (videoRef.current) {
        videoRef.current.pause();
        const delta = 0.042; // Approx 1 frame at 24fps
        videoRef.current.currentTime += forward ? delta : -delta;
    }
  };

  const toggleFavorite = () => {
      onUpdateVideo({ ...video, isFavorite: !video.isFavorite });
  };

  const handleSpeedChange = (speed: number) => {
      setPlaybackSpeed(speed);
      if (videoRef.current) videoRef.current.playbackRate = speed;
      setShowSpeedMenu(false);
  };

  const isMKV = video.path.toLowerCase().endsWith('.mkv');
  const displayName = video.name.replace(/\.[^/.]+$/, "");
  const views = video.views || formatViews();
  const timeAgo = video.timeAgo || formatTimeAgo();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8 max-w-[1600px] mx-auto px-6 lg:px-12 animate-fade-in pb-20">
      {/* Main Content */}
      <div className="lg:col-span-2">
        
        {/* Player Container */}
        <div 
            ref={containerRef}
            className="relative group bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
        >
          {/* Ambient Glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent rounded-2xl blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-1000 -z-10"></div>
          
          <div className="relative w-full aspect-video flex items-center justify-center bg-black">
             {/* MKV WARNING */}
             {isMKV && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-900/90 text-center p-6">
                    <svg className="w-16 h-16 text-yellow-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <h3 className="text-xl font-bold text-white mb-2">Format Not Supported</h3>
                    <p className="text-gray-400 max-w-md">
                        Browsers cannot play <strong>.MKV</strong> files directly. Please convert this file to .MP4 or use a different browser that might support it.
                    </p>
                </div>
             )}

            <video 
              ref={videoRef}
              src={video.url} 
              className="w-full h-full object-contain"
              autoPlay 
              onClick={togglePlay}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            />

            {/* Center Play/Pause Animation */}
            {!isPlaying && !isMKV && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
                    <div className="bg-black/50 p-4 rounded-full backdrop-blur-sm animate-pulse">
                        <PlayIcon />
                    </div>
                </div>
            )}
          </div>

          {/* Custom Controls Overlay */}
          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300 flex flex-col gap-2 z-20 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
             
             {/* Progress Bar */}
             <div className="relative w-full h-1 group/progress cursor-pointer">
                 <div className="absolute inset-0 bg-white/30 rounded-full"></div>
                 <div 
                    className="absolute inset-y-0 left-0 bg-brand-primary rounded-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                 ></div>
                 <input 
                    type="range" 
                    min="0" 
                    max={duration || 100} 
                    value={currentTime} 
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
             </div>

             <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-4">
                    <button onClick={togglePlay} className="text-white hover:text-brand-primary transition-colors">
                        {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>

                    {/* Volume Control */}
                    <div className="flex items-center gap-2 group/vol">
                        <button onClick={() => handleVolumeChange(volume === 0 ? 1 : 0)} className="text-white hover:text-brand-primary">
                            <VolumeIcon level={volume} />
                        </button>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.1"
                            value={volume}
                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                            className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                        />
                    </div>

                    <span className="text-xs text-white/90 font-mono font-medium tracking-wide">
                         {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={toggleFullScreen} className="text-white hover:text-brand-primary">
                        <FullscreenIcon />
                    </button>
                </div>
             </div>
          </div>
        </div>

        {/* --- Tools Bar (Speed, Subs, Frame Step) --- */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                <button 
                    onClick={onPrevVideo} 
                    disabled={!hasPrev}
                    className={`flex items-center gap-2 glass-button px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!hasPrev ? 'opacity-30 cursor-not-allowed' : 'text-glass-subtext hover:text-white'}`}
                >
                    <PrevVideoIcon />
                    <span>Previous</span>
                </button>
                <button 
                    onClick={onNextVideo} 
                    disabled={!hasNext}
                    className={`flex items-center gap-2 glass-button px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!hasNext ? 'opacity-30 cursor-not-allowed' : 'text-glass-subtext hover:text-white'}`}
                >
                    <span>Next</span>
                    <NextVideoIcon />
                </button>
            </div>

            <div className="flex items-center gap-2">
                <div className="relative">
                    <button onClick={() => setShowSpeedMenu(!showSpeedMenu)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white flex items-center gap-1">
                        <SpeedIcon />
                        <span className="text-xs font-bold w-6">{playbackSpeed}x</span>
                    </button>
                    {showSpeedMenu && (
                        <div className="absolute bottom-full left-0 mb-2 w-24 glass-panel rounded-lg shadow-xl py-1 z-50 flex flex-col-reverse">
                            {[0.5, 1, 1.25, 1.5, 2].map(speed => (
                                <button 
                                    key={speed} 
                                    onClick={() => handleSpeedChange(speed)}
                                    className={`px-3 py-1.5 text-xs font-medium text-left hover:bg-white/10 ${speed === playbackSpeed ? 'text-brand-primary' : 'text-glass-subtext'}`}
                                >
                                    {speed}x
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-white/10 mx-1"></div>

                <button onClick={() => stepFrame(false)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white" title="Previous Frame">
                    <StepBackIcon />
                </button>
                <button onClick={() => stepFrame(true)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white" title="Next Frame">
                    <StepForwardIcon />
                </button>
                
                <div className="w-px h-6 bg-white/10 mx-1"></div>
                
                <button onClick={captureThumbnail} className="flex items-center gap-2 glass-button px-3 py-2 rounded-lg text-xs font-medium text-glass-subtext hover:text-brand-accent transition-colors">
                    <CameraIcon />
                    <span className="hidden sm:inline">Thumbnail</span>
                </button>
            </div>
        </div>

        {/* Video Info Section */}
        <div className="mt-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-4">{displayName}</h1>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/5">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-primary to-brand-accent shadow-lg ring-2 ring-black"></div>
               <div>
                 <h3 className="font-bold text-base text-white">Local Drive</h3>
                 <p className="text-xs text-glass-subtext font-medium tracking-wide">Administrator</p>
               </div>
            </div>

            <div className="flex items-center gap-3 relative">
               <button onClick={toggleFavorite} className={`flex items-center gap-2 glass-button px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${video.isFavorite ? 'text-brand-accent border-brand-accent/30 bg-brand-accent/10' : ''}`}>
                  <StarIcon filled={video.isFavorite} />
                  <span>Favorite</span>
               </button>
               
               <div className="relative">
                 <button onClick={() => setShowPlaylistMenu(!showPlaylistMenu)} className="flex items-center gap-2 glass-button px-5 py-2.5 rounded-full text-sm font-medium">
                    <PlaylistPlusIcon />
                    <span>Add to</span>
                 </button>
                 {showPlaylistMenu && (
                     <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowPlaylistMenu(false)} />
                        <div className="absolute top-full right-0 mt-2 w-52 glass-panel rounded-xl shadow-2xl py-2 z-50 border border-white/10">
                            <div className="px-4 py-2 text-[10px] font-bold text-glass-subtext uppercase tracking-widest">Select Playlist</div>
                            <div className="max-h-48 overflow-y-auto">
                                {playlists.map(p => (
                                    <div 
                                        key={p.id} 
                                        onClick={() => { onAddToPlaylist(video.id, p.id); setShowPlaylistMenu(false); }}
                                        className="px-4 py-2.5 hover:bg-white/10 cursor-pointer text-sm font-medium transition-colors border-b border-white/5 last:border-0"
                                    >
                                        {p.name}
                                    </div>
                                ))}
                                {playlists.length === 0 && <div className="px-4 py-3 text-xs italic opacity-50 text-glass-subtext">No playlists yet</div>}
                            </div>
                            <div className="mt-1 pt-1 border-t border-white/10">
                                <button 
                                    onClick={() => { onCreatePlaylist(); setShowPlaylistMenu(false); }}
                                    className="w-full text-left px-4 py-3 text-sm font-bold text-brand-accent hover:bg-white/10 transition-colors flex items-center gap-2"
                                >
                                    <span className="text-lg">+</span> Create New
                                </button>
                            </div>
                        </div>
                     </>
                 )}
               </div>

               <a 
                 href={video.url} 
                 download={video.name}
                 className="flex items-center gap-2 glass-button px-5 py-2.5 rounded-full text-sm font-medium hover:text-white hover:bg-white/10 transition-colors"
               >
                   <DownloadIcon />
                   <span>Save</span>
               </a>

               <div className="relative">
                    <button onClick={() => setShowShareMenu(!showShareMenu)} className="glass-button p-2.5 rounded-full">
                        <ShareIcon />
                    </button>
                    {showShareMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} />
                            <div className="absolute top-full right-0 mt-2 w-56 glass-panel rounded-xl shadow-xl py-2 z-50 border border-white/10">
                                <div className="px-4 py-2 text-xs font-bold text-glass-subtext uppercase">Share</div>
                                <button 
                                    onClick={() => { navigator.clipboard.writeText(window.location.href); setShowShareMenu(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-white/10 text-sm flex items-center gap-3"
                                >
                                    <LinkIcon />
                                    <span>Copy Link</span>
                                </button>
                            </div>
                        </>
                    )}
               </div>
            </div>
          </div>
        </div>

        {/* Description Box */}
        <div className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-4 transition-colors">
           <div className="flex items-center gap-3 text-sm font-bold mb-3 text-white/90">
             <span>{views}</span>
             <span className="text-white/20">•</span>
             <span>{timeAgo}</span>
           </div>
           
           <div className="text-sm text-glass-text whitespace-pre-wrap leading-relaxed">
               {video.description || "No description available for this video."}
           </div>
        </div>
      </div>

      {/* Sidebar: Recommendations */}
      <div className="lg:col-span-1">
         <h3 className="text-lg font-bold mb-5 text-white/90 border-l-4 border-brand-primary pl-4">Up Next</h3>
         <div className="flex flex-col gap-4">
            {relatedVideos.map(related => (
                <div key={related.id} className="flex gap-3 cursor-pointer group p-2 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5" onClick={() => onVideoSelect(related)}>
                    <div className="relative w-40 h-24 flex-shrink-0 bg-gray-800 rounded-lg overflow-hidden border border-white/5 shadow-md">
                       {related.thumbnail ? (
                           <img src={related.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-300 group-hover:scale-105" />
                       ) : (
                           <div className="w-full h-full bg-black flex items-center justify-center">
                                <span className="text-[10px] text-gray-500">No Thumb</span>
                           </div>
                       )}
                       <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-bold">
                         {related.durationStr || "VIDEO"}
                       </div>
                    </div>
                    <div className="flex flex-col gap-1 min-w-0 pt-1">
                        <h4 className="text-sm font-bold line-clamp-2 leading-snug text-white/90 group-hover:text-brand-primary transition-colors">{related.name.replace(/\.[^/.]+$/, "")}</h4>
                        <p className="text-xs text-glass-subtext truncate">{related.folder}</p>
                    </div>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
};

export default VideoPlayer;