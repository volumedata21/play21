import React, { useState, useEffect, useRef } from 'react';
import { VideoFile } from '../types';
import { formatDuration, formatTimeAgo, formatViews } from '../services/fileService';
import { PlayIcon, CheckCircleIcon, HistoryIcon } from './Icons';

interface VideoCardProps {
  video: VideoFile;
  isInWatchLater?: boolean;
  onToggleWatchLater?: () => void;
  onClick: () => void;
}

const VideoCard: React.FC<VideoCardProps> = ({
  video,
  isInWatchLater = false,
  onToggleWatchLater,
  onClick
}) => {
  const [thumbnail, setThumbnail] = useState<string | null>(video.thumbnail || null);
  const [duration, setDuration] = useState<string>(video.durationStr || "0:00");
  const [isAnimating, setIsAnimating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const displayViews = video.viewsCount !== undefined ? `${video.viewsCount} views` : (video.views || formatViews());

  // 1. Sync state with props if they change (e.g. after a server re-scan)
  useEffect(() => {
    if (video.durationStr && video.durationStr !== "0:00") {
      setDuration(video.durationStr);
    }
  }, [video.durationStr]);

  // 2. Smart Metadata Loading (Fixes the "Missing Duration" bug)
  useEffect(() => {
    // If we already have BOTH a thumbnail and a valid duration, do nothing.
    if (thumbnail && duration !== "0:00") return;

    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleLoadedMetadata = () => {
      // Fix Duration if missing
      if (duration === "0:00" && videoEl.duration && !isNaN(videoEl.duration)) {
        setDuration(formatDuration(videoEl.duration));
      }

      // Only seek to capture thumbnail if we explicitly need one
      if (!thumbnail) {
        videoEl.currentTime = 5;
      }
    };

    const handleSeeked = () => {
      if (thumbnail) return; // Don't overwrite if we already have one
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          setThumbnail(dataUrl);
        }
      } catch (e) {
        console.warn("Could not generate thumbnail", e);
      }
    };

    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('seeked', handleSeeked);

    // Force load if readyState is 0 (HAVE_NOTHING) to ensure metadata triggers
    if (videoEl.readyState === 0) videoEl.load();

    return () => {
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('seeked', handleSeeked);
    };
  }, [video.url, thumbnail, duration]); // Re-run if any of these are missing/change

  const handleWatchLaterClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
    if (onToggleWatchLater) onToggleWatchLater();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    onClick();
  };

  return (
    <div className="group cursor-pointer flex flex-col gap-3 relative outline-none focus:outline-none focus:ring-0 tap-highlight-transparent">
      {/* Thumbnail Container */}
      <div
        className="relative aspect-video rounded-2xl overflow-hidden bg-white/5 border border-white/5 shadow-2xl transition-all duration-300 transform group-hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] group-hover:-translate-y-1 outline-none focus:outline-none"
        onClick={handleCardClick}
      >
        {/* CRITICAL FIX: Render the hidden video if we are missing the thumbnail OR the duration.
            Previously, this was '!video.thumbnail', so existing thumbnails blocked duration fixing.
        */}
        {(!thumbnail || duration === "0:00") && (
          <video
            ref={videoRef}
            src={video.url}
            className="hidden"
            preload="metadata"
            muted
            crossOrigin="anonymous" 
          />
        )}

        {thumbnail ? (
          <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
            <img
              src={thumbnail}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-xl opacity-50 scale-110"
            />
            <img
              src={thumbnail}
              alt={video.name}
              className="relative z-10 h-full w-auto object-contain shadow-2xl transition-opacity duration-300"
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5 backdrop-blur-sm">
            <div className="scale-75 opacity-50"><PlayIcon /></div>
          </div>
        )}

        {/* Duration Badge - Only show if valid */}
        {duration && duration !== "0:00" && (
          <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md border border-white/10 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide text-white z-20">
            {duration}
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Watch Later Button */}
        {onToggleWatchLater && (
          <div
            className={`absolute top-2 right-2 p-1.5 rounded-full transition-all duration-300 z-30 flex items-center justify-center
              ${isInWatchLater ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'}
              ${isInWatchLater 
                ? 'bg-gradient-to-br from-brand-primary to-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] border border-white/20' 
                : 'bg-black/60 text-white/70 hover:bg-brand-primary hover:text-white backdrop-blur-sm border border-transparent'}
              ${isAnimating ? 'scale-125 brightness-125' : 'scale-100'}
            `}
            onClick={handleWatchLaterClick}
            title="Watch Later"
          >
             <div className="scale-75">
                <HistoryIcon />
             </div>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="flex gap-3 px-1" onClick={handleCardClick}>
        <div className="flex-shrink-0 mt-0.5">
          {video.channelAvatar ? (
            <img
              src={video.channelAvatar}
              className="w-9 h-9 rounded-full object-cover shadow-lg border border-white/10"
              alt={video.channel || "Channel"}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-secondary to-blue-600 shadow-lg border border-white/10 flex items-center justify-center text-xs font-bold text-white">
              {video.channel ? video.channel.charAt(0).toUpperCase() : (video.name[0] || "L")}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="text-[15px] font-semibold text-white/90 line-clamp-2 leading-snug group-hover:text-brand-primary transition-colors">
            {video.name}
          </h3>
          <div className="text-xs text-glass-subtext flex flex-col gap-0.5">
            <span className="font-medium hover:text-white transition-colors truncate">
              {video.channel || video.folder}
            </span>
            <div className="flex items-center gap-1.5 opacity-80">
              <span>{displayViews}</span>
              <span className="w-0.5 h-0.5 bg-current rounded-full"></span>
              <span>
                {video.releaseDate
                  ? new Date(video.releaseDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC'
                  })
                  : video.timeAgo}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;

export const RecommendationRow = ({
  videos,
  onVideoSelect
}: {
  videos: VideoFile[],
  onVideoSelect: (v: VideoFile) => void
}) => {
  return (
    <div className="my-10 animate-fade-in py-8 bg-white/[0.03] backdrop-blur-sm border-y border-white/5 md:border md:rounded-3xl relative isolate -mx-6 md:mx-0">
      <div className="flex items-center gap-3 mb-6 px-6">
        <div className="w-1.5 h-6 bg-brand-primary rounded-full shadow-[0_0_12px_rgba(37,99,235,0.8)]"></div>
        <h3 className="text-xl font-bold text-white tracking-tight">Recommended for You</h3>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x touch-pan-x px-6">
        {videos.map((video) => (
          <div
            key={video.id}
            onClick={(e) => {
              e.preventDefault();
              onVideoSelect(video);
            }}
            className="flex-none w-36 sm:w-44 md:w-52 snap-start group cursor-pointer outline-none focus:outline-none focus:ring-0"
          >
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-white/5 bg-black transition-all duration-500 group-hover:scale-[1.03] group-hover:border-brand-primary/50 group-hover:shadow-[0_0_30px_rgba(37,99,235,0.2)]">
              <img
                src={video.thumbnail || ''}
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                alt={video.name}
              />
              <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-black via-black/80 to-transparent opacity-100" />
              
              {/* Added Duration Badge to Recommendation Row too */}
              {video.durationStr && video.durationStr !== "0:00" && (
                 <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md border border-white/10 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wide text-white z-20">
                    {video.durationStr}
                 </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 text-left">
                {(video.channelAvatar || (video as any).channel_avatar) && (
                  <div className="mb-3">
                    <img
                      src={video.channelAvatar || (video as any).channel_avatar}
                      className="w-8 h-8 rounded-full border-[1.5px] border-white/50 shadow-[0_0_12px_rgba(255,255,255,0.3)] object-cover"
                      alt={video.channel || "Channel"}
                    />
                  </div>
                )}
                <p className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug drop-shadow-md">
                  {video.name}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};