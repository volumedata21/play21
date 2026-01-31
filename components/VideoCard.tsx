import React, { useState, useEffect, useRef } from 'react';
import { VideoFile } from '../types';
import { formatDuration, formatTimeAgo, formatViews } from '../services/fileService';
import { PlayIcon, CheckCircleIcon } from './Icons';

interface VideoCardProps {
  video: VideoFile;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick: () => void;
}

const VideoCard: React.FC<VideoCardProps> = ({ video, isSelected = false, onSelect, onClick }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(video.thumbnail || null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<string>(video.durationStr || "0:00");
  // Use real DB views if available, otherwise fall back to formatter
  const displayViews = video.viewsCount !== undefined ? `${video.viewsCount} views` : (video.views || formatViews());

  // Attempt to generate thumbnail if not provided
  useEffect(() => {
    if (thumbnail) return; // If we have a thumbnail (from mock or previously generated), skip

    const videoEl = videoRef.current;
    if (!videoEl) return;

    const captureThumbnail = () => {
      videoEl.currentTime = 5;
    };

    const handleSeeked = () => {
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

    const handleLoadedMetadata = () => {
      if (!video.durationStr) {
        setDuration(formatDuration(videoEl.duration));
      }
      captureThumbnail();
    };

    videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoEl.addEventListener('seeked', handleSeeked);

    return () => {
      videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.removeEventListener('seeked', handleSeeked);
    };
  }, [video.url, thumbnail]);

  const handleCardClick = (e: React.MouseEvent) => {
    // If we are in selection mode (onSelect is provided and active elsewhere implies we might want to default to select),
    // but standard UI pattern is: click image to play, click checkbox to select.
    // However, if onSelect is present, we provide a dedicated hit area.
    onClick();
  };

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) onSelect();
  };

  return (
    <div className={`group cursor-pointer flex flex-col gap-3 relative ${isSelected ? 'bg-white/5 p-2 -m-2 rounded-2xl' : ''}`}>
      {/* Thumbnail Container */}
      <div
        className={`relative aspect-video rounded-2xl overflow-hidden bg-white/5 border border-white/5 shadow-2xl transition-all duration-300 transform ${isSelected ? 'ring-2 ring-brand-primary scale-[1.02]' : 'group-hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] group-hover:-translate-y-1'}`}
        onClick={handleCardClick}
      >
        {/* Hidden video for processing if no thumbnail provided */}
        {!video.thumbnail && (
          <video
            ref={videoRef}
            src={video.url}
            className="hidden"
            preload="metadata"
            muted
          />
        )}

        {thumbnail ? (
          <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
            {/* 1. THE BLURRED BACKGROUND LAYER */}
            <img
              src={thumbnail}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-xl opacity-50 scale-110"
            />

            {/* 2. THE ACTUAL SHARP IMAGE LAYER */}
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

        {/* Duration Badge */}
        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md border border-white/10 px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide">
          {duration}
        </div>

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Selection Checkbox - Visible on Hover or if Selected */}
        {onSelect && (
          <div
            className={`absolute top-2 left-2 p-1 rounded-full transition-all duration-200 z-10 ${isSelected ? 'opacity-100 bg-black/50' : 'opacity-0 group-hover:opacity-100 bg-black/30 hover:bg-black/50'}`}
            onClick={handleSelectClick}
          >
            <CheckCircleIcon checked={isSelected} />
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="flex gap-3 px-1" onClick={handleCardClick}>
        {/* UPDATED: Channel Avatar */}
        <div className="flex-shrink-0 mt-0.5">
          {video.channelAvatar ? (
            <img
              src={video.channelAvatar}
              className="w-9 h-9 rounded-full object-cover shadow-lg border border-white/10"
              alt={video.channel || "Channel"}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-secondary to-blue-600 shadow-lg border border-white/10 flex items-center justify-center text-xs font-bold text-white">
              {/* Fallback to Channel Initial or Video Initial */}
              {video.channel ? video.channel.charAt(0).toUpperCase() : (video.name[0] || "L")}
            </div>
          )}
        </div>
        {/* Texts */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="text-[15px] font-semibold text-white/90 line-clamp-2 leading-snug group-hover:text-brand-primary transition-colors">
            {video.name}
          </h3>
          <div className="text-xs text-glass-subtext flex flex-col gap-0.5">
            {/* UPDATED: Channel Name or Folder */}
            <span className="font-medium hover:text-white transition-colors truncate">
              {video.channel || video.folder}
            </span>
            <div className="flex items-center gap-1.5 opacity-80">
              <span>{displayViews}</span>
              <span className="w-0.5 h-0.5 bg-current rounded-full"></span>
              {/* This checks if we have a release date and formats it to look nice */}
              <span>
                {video.releaseDate
                  ? new Date(video.releaseDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC' // Important for Synology/Linux consistency
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-6">
        <div className="w-1.5 h-6 bg-brand-primary rounded-full shadow-[0_0_12px_rgba(37,99,235,0.8)]"></div>
        <h3 className="text-xl font-bold text-white tracking-tight">Recommended for You</h3>
      </div>
      
      {/* Scroll Container */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x touch-pan-x px-6">
        {videos.map((video) => (
          <div 
            key={video.id}
            onClick={() => onVideoSelect(video)}
            className="flex-none w-36 sm:w-44 md:w-52 snap-start group cursor-pointer"
          >
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-white/5 bg-black transition-all duration-500 group-hover:scale-[1.03] group-hover:border-brand-primary/50 group-hover:shadow-[0_0_30px_rgba(37,99,235,0.2)]">
              <img 
                src={video.thumbnail || ''} 
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                alt={video.name}
              />
              
              {/* 1. FIXED: Gradient only covers the bottom 40% (approx 1/3rd visually) */}
              <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-black via-black/80 to-transparent opacity-100" />
              
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 text-left">
                
                {/* 2. Channel Avatar with Thicker Stroke & Glow */}
                {(video.channelAvatar || (video as any).channel_avatar) && (
                    <div className="mb-3">
                        <img 
                            src={video.channelAvatar || (video as any).channel_avatar} 
                            // Added border-[1.5px] and custom shadow for the glow
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