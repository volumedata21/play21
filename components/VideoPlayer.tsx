import React, { useState, useEffect, useRef } from 'react';
import { VideoFile, Playlist } from '../types';
import { LikeIcon, ShareIcon, MenuIcon, CameraIcon, StarIcon, StepBackIcon, StepForwardIcon, PlaylistPlusIcon, NextVideoIcon, PrevVideoIcon, SpeedIcon, CCIcon, DownloadIcon, LinkIcon, XIcon } from './Icons';
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

// Helper to render description with clickable Links and Timestamps
const DescriptionRenderer = ({ text, onSeek }: { text: string, onSeek: (time: number) => void }) => {
    if (!text) return <p className="text-glass-text/90 leading-relaxed text-base">No description available.</p>;

    // Regex to find URLs and Timestamps (e.g. 02:30 or 1:04:20)
    const regex = /((?:https?:\/\/|www\.)[^\s]+)|(\b\d{1,2}:\d{2}(?::\d{2})?\b)/g;

    const parts = text.split(regex).filter(part => part !== undefined);

    return (
        <div className="text-glass-text/90 leading-relaxed text-base whitespace-pre-wrap font-sans">
            {parts.map((part, i) => {
                if (!part) return null;

                // Is URL?
                if (part.match(/^(https?:\/\/|www\.)/)) {
                    return (
                        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline hover:text-brand-accent transition-colors">
                            {part}
                        </a>
                    );
                }

                // Is Timestamp?
                if (part.match(/^\d{1,2}:\d{2}(?::\d{2})?$/)) {
                    // Convert "01:30" to 90 seconds
                    const seconds = part.split(':').reduce((acc, time) => (60 * acc) + +time, 0);
                    return (
                        <button key={i} onClick={() => onSeek(seconds)} className="text-brand-accent hover:underline font-bold inline-block mx-1 bg-brand-accent/10 px-1 rounded">
                            {part}
                        </button>
                    );
                }

                return <span key={i}>{part}</span>;
            })}
        </div>
    );
};

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
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);

    // State for loading indicators
    const [isProcessingThumb, setIsProcessingThumb] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);

    // Check if current thumbnail is custom (saved as -custom.jpg) or temporary (data:image)
    // FIXED: Only declared once now
    const isCustomThumbnail = video.thumbnail && (video.thumbnail.includes('-custom.jpg') || video.thumbnail.startsWith('data:'));

    // Check if this video actually HAS subtitles
    const hasSubtitles = video.subtitles && video.subtitles.length > 0;

    useEffect(() => {
        setShowPlaylistMenu(false);
        setShowShareMenu(false);
        setPlaybackSpeed(1);
        setSubtitlesEnabled(false);

        if (videoRef.current) {
            videoRef.current.load();
            videoRef.current.playbackRate = 1;
        }
    }, [video.id, video.url]);

    // Increment view count on mount
    useEffect(() => {
        // We fire-and-forget this request. We don't need to wait for the result.
        fetch(`/api/videos/${video.id}/view`, { method: 'POST' });
    }, [video.id]);

    // Resume playback from saved position
    // Resume playback from saved position
    useEffect(() => {
        const vid = videoRef.current;
        if (vid && video.playbackPosition && video.playbackPosition > 0) {
            if (video.duration && video.playbackPosition < video.duration - 10) {
                vid.currentTime = video.playbackPosition;
            }
        }
    }, [video.id]);

    const captureThumbnail = async () => {
        if (!videoRef.current || isProcessingThumb) return;

        setIsProcessingThumb(true);
        const vid = videoRef.current;

        // BOX-THINKING: Get native video dimensions instead of hardcoding 1280x720
        const nativeWidth = vid.videoWidth;
        const nativeHeight = vid.videoHeight;

        const canvas = document.createElement('canvas');
        canvas.width = nativeWidth;
        canvas.height = nativeHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            // Draw the frame at its true native resolution
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

            try {
                // 1. Send image to Server
                const res = await fetch(`/api/videos/${video.id}/thumbnail`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: dataUrl })
                });
                const data = await res.json();

                if (data.success) {
                    // 2. Update React State with the PERMANENT URL from server
                    onUpdateVideo({ ...video, thumbnail: data.thumbnail });
                } else {
                    alert("Failed to save thumbnail on server.");
                }
            } catch (e) {
                console.error("Failed to upload thumbnail", e);
                alert("Error saving thumbnail.");
            }
        }
        setIsProcessingThumb(false);
    };

    const removeThumbnail = async () => {
        if (isProcessingThumb) return;
        setIsProcessingThumb(true);
        try {
            // 1. Tell Server to delete custom file
            const res = await fetch(`/api/videos/${video.id}/thumbnail`, {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.success) {
                // 2. Revert React State to the fallback URL returned by server
                onUpdateVideo({ ...video, thumbnail: data.thumbnail });
            }
        } catch (e) {
            console.error("Failed to remove thumbnail", e);
        }
        setIsProcessingThumb(false);
    };

    const stepFrame = (forward: boolean) => {
        if (videoRef.current) {
            const delta = 0.042;
            videoRef.current.currentTime += forward ? delta : -delta;
        }
    };

    const toggleFavorite = async (video: VideoFile) => {
        const newFavoriteStatus = !video.isFavorite;

        try {
            // 1. Tell the Server to update the SQLite database
            await fetch(`/api/videos/${video.id}/favorite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFavorite: newFavoriteStatus })
            });

            // 2. Update the state in App.tsx
            // This ensures both the list AND the currently playing video 
            // object get the new 'isFavorite' value.
            onUpdateVideo({ ...video, isFavorite: newFavoriteStatus });
            
        } catch (e) {
            console.error("Failed to update favorite", e);
        }
    };

    const saveProgress = () => {
        if (!videoRef.current) return;
        const time = videoRef.current.currentTime;
        // Don't save if we are at the very start
        if (time > 5) {
            // 1. Update Server
            fetch(`/api/videos/${video.id}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time })
            }).catch(e => console.error("Save failed", e));

            // 2. Update Local State (THIS IS THE FIX)
            // This ensures App.tsx remembers the new time if you navigate away
            onUpdateVideo({ ...video, playbackPosition: time });
        }
    };

    const cyclePlaybackSpeed = () => {
        const speeds = [0.25, 0.5, 1, 1.25, 1.5, 2];
        const currentIndex = speeds.indexOf(playbackSpeed);
        const nextSpeed = speeds[(currentIndex + 1) % speeds.length];

        setPlaybackSpeed(nextSpeed);
        if (videoRef.current) {
            videoRef.current.playbackRate = nextSpeed;
        }
    };

    const toggleSubtitles = () => {
        if (!videoRef.current) return;
        const newState = !subtitlesEnabled;
        setSubtitlesEnabled(newState);

        for (let i = 0; i < videoRef.current.textTracks.length; i++) {
            videoRef.current.textTracks[i].mode = newState ? 'showing' : 'hidden';
        }
    };

    const displayName = video.name;
    const views = video.views || formatViews();
    const timeAgo = video.timeAgo || formatTimeAgo();

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8 max-w-[1600px] mx-auto px-6 lg:px-12 animate-fade-in pb-20">
            {/* Main Content */}
            <div className="lg:col-span-2">
                {/* Player Container */}
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent rounded-2xl blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-1000"></div>
                    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">

                        {/* 1. DYNAMIC BLURRED BACKGROUND */}
                        {/* We use the thumbnail but set it to fill the entire container background */}
                        {video.thumbnail && (
                            <div
                                className="absolute inset-0 w-full h-full bg-cover bg-center blur-3xl opacity-50 scale-110 pointer-events-none"
                                style={{ backgroundImage: `url(${video.thumbnail})` }}
                            />
                        )}

                        {/* 2. THE VIDEO LAYER */}
                        <video
                            ref={videoRef}
                            src={`/api/stream/${video.id}`}
                            controls
                            autoPlay
                            crossOrigin="anonymous"
                            /* FIX: 'object-contain' is the magic word here. 
                               It keeps the video at its native ratio (no squishing) 
                               BUT keeps the video element itself at 16:9 so the 
                               controls stretch across the whole bottom bar.
                            */
                            className="relative z-10 w-full h-full object-contain"
                            onPause={saveProgress}
                            onEnded={() => {
                                fetch(`/api/videos/${video.id}/progress`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ time: 0 })
                                });
                                onUpdateVideo({ ...video, playbackPosition: 0 });
                            }}
                        >
                            {video.subtitles && video.subtitles.map((sub, index) => (
                                <track
                                    key={index}
                                    kind="subtitles"
                                    src={sub.src}
                                    srcLang={sub.lang}
                                    label={sub.label}
                                    default={index === 0 && subtitlesEnabled}
                                />
                            ))}
                        </video>

                        {subtitlesEnabled && !hasSubtitles && (
                            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-1 rounded text-lg pointer-events-none z-20">
                                [No Subtitle File Found]
                            </div>
                        )}
                    </div>
                </div>

                {/* Controls Bar */}
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
                            <span>Next Video</span>
                            <NextVideoIcon />
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Speed Control */}
                        <button
                            onClick={cyclePlaybackSpeed}
                            className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white flex items-center gap-1 min-w-[70px] justify-center"
                            title="Cycle Playback Speed"
                        >
                            <SpeedIcon />
                            <span className="text-xs font-bold">{playbackSpeed}x</span>
                        </button>

                        {/* Subtitle Toggle */}
                        <button
                            onClick={toggleSubtitles}
                            disabled={!hasSubtitles}
                            className={`glass-button p-2 rounded-lg transition-colors ${subtitlesEnabled ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/30' : 'text-glass-subtext hover:text-white'} ${!hasSubtitles ? 'opacity-30' : ''}`}
                            title={hasSubtitles ? "Toggle Subtitles" : "No subtitles available"}
                        >
                            <CCIcon />
                        </button>

                        <div className="w-px h-6 bg-white/10 mx-1"></div>

                        <button onClick={() => stepFrame(false)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white">
                            <StepBackIcon />
                        </button>
                        <button onClick={() => stepFrame(true)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white">
                            <StepForwardIcon />
                        </button>

                        <div className="w-px h-6 bg-white/10 mx-1"></div>

                        {/* Thumbnail Button (Toggle Capture/Remove) */}
                        <button
                            onClick={isCustomThumbnail ? removeThumbnail : captureThumbnail}
                            disabled={isProcessingThumb}
                            className={`flex items-center gap-2 glass-button px-3 py-2 rounded-lg text-xs font-medium transition-colors ${isCustomThumbnail ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-glass-subtext hover:text-brand-accent'} ${isProcessingThumb ? 'opacity-50 cursor-wait' : ''}`}
                            title={isCustomThumbnail ? "Revert to original thumbnail" : "Set current frame as thumbnail"}
                        >
                            {isCustomThumbnail ? <XIcon /> : <CameraIcon />}
                            <span className="hidden sm:inline">
                                {isProcessingThumb ? 'Saving...' : (isCustomThumbnail ? 'Remove Thumb' : 'Thumbnail')}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Title & Actions */}
                <div className="mt-4 mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-4">{displayName}</h1>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/5">
                        <div className="flex items-center gap-4">
                            {/* Channel Avatar */}
                            {/* Channel Avatar */}
                            {video.channelAvatar ? (
                                <img
                                    src={video.channelAvatar}
                                    className="w-12 h-12 rounded-full object-cover shadow-lg ring-2 ring-black bg-white/10"
                                    alt={video.channel || "Channel"}
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-brand-primary to-brand-accent shadow-lg ring-2 ring-black flex items-center justify-center text-xl font-bold text-white">
                                    {video.channel ? video.channel.charAt(0).toUpperCase() : "L"}
                                </div>
                            )}

                            <div>
                                {/* USE NFO DATA HERE */}
                                <h3 className="font-bold text-base text-white">
                                    {video.channel || "Local Drive"}
                                </h3>
                                <p className="text-xs text-glass-subtext font-medium tracking-wide">
                                    {video.genre || "Administrator"}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 relative">
                            <button
                                onClick={() => toggleFavorite(video)}
                                className={`flex items-center gap-2 glass-button px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${video.isFavorite ? 'text-brand-accent border-brand-accent/30 bg-brand-accent/10' : ''}`}
                            >
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
                        <span>{video.releaseDate || timeAgo}</span>
                    </div>

                    <div className="text-sm text-glass-text">
                        <DescriptionRenderer
                            text={video.description || ""}
                            onSeek={(time) => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = time;
                                    videoRef.current.play();
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

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