import React, { useState, useEffect, useRef } from 'react';
import { VideoFile, Playlist } from '../types';
import { LikeIcon, ShareIcon, MenuIcon, CameraIcon, StarIcon, StepBackIcon, StepForwardIcon, PlaylistPlusIcon, NextVideoIcon, PrevVideoIcon, SpeedIcon, CCIcon, DownloadIcon, LinkIcon } from './Icons';
import { formatViews, formatTimeAgo } from '../services/fileService';

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
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setShowPlaylistMenu(false);
    setShowShareMenu(false);
    setShowSpeedMenu(false);
    setPlaybackSpeed(1);
    setSubtitlesEnabled(false);
    if(videoRef.current) {
        videoRef.current.playbackRate = 1;
    }
  }, [video.id]);

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
        // Approx 1 frame at 24fps
        const delta = 0.042; 
        videoRef.current.currentTime += forward ? delta : -delta;
    }
  };

  const toggleFavorite = () => {
      onUpdateVideo({ ...video, isFavorite: !video.isFavorite });
  };

  const handleSpeedChange = (speed: number) => {
      setPlaybackSpeed(speed);
      if (videoRef.current) {
          videoRef.current.playbackRate = speed;
      }
      setShowSpeedMenu(false);
  };

  const toggleSubtitles = () => {
      setSubtitlesEnabled(!subtitlesEnabled);
      // Logic for actual VTT tracks would go here
  };

  const displayName = video.name.replace(/\.[^/.]+$/, "");
  const views = video.views || formatViews();
  const timeAgo = video.timeAgo || formatTimeAgo();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8 max-w-[1600px] mx-auto px-6 lg:px-12 animate-fade-in pb-20">
      {/* Main Content */}
      <div className="lg:col-span-2">
        {/* Player Container */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent rounded-2xl blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-1000"></div>
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            <video 
              ref={videoRef}
              src={video.url} 
              controls 
              autoPlay 
              className="w-full h-full"
            />
            {subtitlesEnabled && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-1 rounded text-lg">
                    [Subtitles On - No Tracks Found]
                </div>
            )}
          </div>
        </div>

        {/* Controls Bar for Frames/Thumbnails/Speed */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            {/* Video Navigation Buttons */}
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
                    <span>Next Video</span>
                    <NextVideoIcon />
                </button>
            </div>

            {/* Playback Tools */}
            <div className="flex items-center gap-2">
                {/* Speed Control */}
                <div className="relative">
                    <button onClick={() => setShowSpeedMenu(!showSpeedMenu)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white flex items-center gap-1" title="Playback Speed">
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

                {/* Subtitles Toggle */}
                <button onClick={toggleSubtitles} className={`glass-button p-2 rounded-lg transition-colors ${subtitlesEnabled ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/30' : 'text-glass-subtext hover:text-white'}`} title="Toggle Subtitles">
                    <CCIcon />
                </button>

                 <div className="w-px h-6 bg-white/10 mx-1"></div>

                <button onClick={() => stepFrame(false)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white" title="Previous Frame">
                    <StepBackIcon />
                </button>
                <button onClick={() => stepFrame(true)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white" title="Next Frame">
                    <StepForwardIcon />
                </button>
                
                <div className="w-px h-6 bg-white/10 mx-1"></div>
                
                <button onClick={captureThumbnail} className="flex items-center gap-2 glass-button px-3 py-2 rounded-lg text-xs font-medium text-glass-subtext hover:text-brand-accent transition-colors" title="Set current frame as thumbnail">
                    <CameraIcon />
                    <span className="hidden sm:inline">Thumbnail</span>
                </button>
            </div>
        </div>

        {/* Title & Actions */}
        <div className="mt-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-4">{displayName}</h1>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/5">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-primary to-brand-accent shadow-lg ring-2 ring-black"></div>
               <div>
                 <h3 className="font-bold text-base text-white">Local Drive</h3>
                 <p className="text-xs text-glass-subtext font-medium tracking-wide">Administrator</p>
               </div>
               <button className="bg-white text-black px-6 py-2 rounded-full text-sm font-bold hover:bg-gray-200 transition-colors ml-2 shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                 Subscribe
               </button>
            </div>

            <div className="flex items-center gap-3 relative">
               {/* Favorite */}
               <button onClick={toggleFavorite} className={`flex items-center gap-2 glass-button px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${video.isFavorite ? 'text-brand-accent border-brand-accent/30 bg-brand-accent/10' : ''}`}>
                  <StarIcon filled={video.isFavorite} />
                  <span>Favorite</span>
               </button>
               
               {/* Add to Playlist */}
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

                {/* Save Video (Download) */}
               <a 
                 href={video.url} 
                 download={video.name}
                 className="flex items-center gap-2 glass-button px-5 py-2.5 rounded-full text-sm font-medium hover:text-white hover:bg-white/10 transition-colors"
                 title="Save Video to Disk"
               >
                   <DownloadIcon />
                   <span>Save</span>
               </a>

               {/* Share Button */}
               <div className="relative">
                    <button onClick={() => setShowShareMenu(!showShareMenu)} className="glass-button p-2.5 rounded-full" title="Share">
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
                                <button 
                                    onClick={() => { onCreatePlaylist(); setShowShareMenu(false); }}
                                    className="w-full text-left px-4 py-3 hover:bg-white/10 text-sm flex items-center gap-3 text-brand-secondary font-bold"
                                >
                                    <PlaylistPlusIcon />
                                    <span>Create Playlist</span>
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
              <div className="flex flex-col items-start gap-4">
                  <p className="text-glass-text/90 leading-relaxed text-base">
                      {video.description || "No description available for this video."}
                  </p>
              </div>
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
                           <video src={related.url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" preload="metadata" />
                       )}
                       <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-bold">
                         {related.durationStr || "VIDEO"}
                       </div>
                    </div>
                    <div className="flex flex-col gap-1 min-w-0 pt-1">
                        <h4 className="text-sm font-bold line-clamp-2 leading-snug text-white/90 group-hover:text-brand-primary transition-colors">{related.name.replace(/\.[^/.]+$/, "")}</h4>
                        <p className="text-xs text-glass-subtext truncate">{related.folder}</p>
                        <p className="text-xs text-glass-subtext mt-auto">{related.views || formatViews()}</p>
                    </div>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
};

export default VideoPlayer;