import React, { useState, useEffect, useRef } from 'react';
import { VideoFile, Playlist } from '../types';
import { LikeIcon, ShareIcon, MenuIcon, CameraIcon, StarIcon, YouTubeIcon, StepBackIcon, StepForwardIcon, PlaylistPlusIcon, NextVideoIcon, HistoryIcon, PrevVideoIcon, SpeedIcon, CCIcon, DownloadIcon, LinkIcon, XIcon, AutoplayIcon } from './Icons';
import { formatViews, formatTimeAgo } from '../services/fileService';

interface VideoPlayerProps {
    video: VideoFile;
    relatedVideos: VideoFile[];
    nextQueue: VideoFile[];
    playlists: Playlist[];
    hasNext: boolean;
    hasPrev: boolean;
    onVideoSelect: (video: VideoFile) => void;
    onUpdateVideo: (video: VideoFile) => void;
    onAddToPlaylist: (videoId: string, playlistId: string) => void;
    onToggleWatchLater: (videoId: string) => void;
    onNextVideo: () => void;
    onPrevVideo: () => void;
    onCreatePlaylist: () => void;
}

// Helper to format file size (e.g. 1.5 GB)
const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

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
    nextQueue,
    playlists,
    hasNext,
    hasPrev,
    onVideoSelect,
    onUpdateVideo,
    onAddToPlaylist,
    onToggleWatchLater,
    onNextVideo,
    onPrevVideo,
    onCreatePlaylist
}) => {
    const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
    const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
    const [countdown, setCountdown] = useState<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const [isTranscoding, setIsTranscoding] = useState(false);

    // State for loading indicators
    const [isProcessingThumb, setIsProcessingThumb] = useState(false);

    const upNextVideo = (nextQueue && nextQueue.length > 0) ? nextQueue[0] : relatedVideos[0];

    const videoRef = useRef<HTMLVideoElement>(null);

    const lastTapRef = useRef<{ time: number, x: number } | null>(null);

    const savedTimeRef = useRef<number>(0);

    // FIX: Restore time when switching to Transcode stream
    useEffect(() => {
        if (isTranscoding && videoRef.current) {
            const handleLoaded = () => {
                if (savedTimeRef.current > 0) {
                    console.log(`Restoring playback position to ${savedTimeRef.current}s`);
                    videoRef.current.currentTime = savedTimeRef.current;
                    // Try to play immediately
                    videoRef.current.play().catch(e => console.warn("Autoplay blocked after restore", e));
                }
            };
            // Listen for the new stream to be ready, then run the restore function ONCE
            videoRef.current.addEventListener('loadedmetadata', handleLoaded, { once: true });
            
            return () => {
                videoRef.current?.removeEventListener('loadedmetadata', handleLoaded);
            };
        }
    }, [isTranscoding]);

    // State for file size
    const [fileSize, setFileSize] = useState<string | null>(null);

    // FIX: Fetch file size when video loads
    useEffect(() => {
        const fetchSize = async () => {
            try {
                // Ask the server for the file header only (lightweight)
                const res = await fetch(`/api/stream/${video.id}`, { method: 'HEAD' });
                const size = res.headers.get('content-length');
                if (size) setFileSize(formatFileSize(parseInt(size)));
            } catch (e) {
                console.error("Could not get file size", e);
                setFileSize(null);
            }
        };
        fetchSize();
    }, [video.id]);

    const handleTouchEnd = (e: React.TouchEvent) => {
        const now = Date.now();
        // Use 'touches' if changedTouches is empty, just to be safe
        const touch = e.changedTouches[0] || e.touches[0];
        if (!touch) return;

        const touchX = touch.clientX;
        const screenWidth = window.innerWidth;

        if (lastTapRef.current && (now - lastTapRef.current.time < 300)) {
            // DOUBLE TAP DETECTED
            e.preventDefault();

            // Determine side: Left 30% vs Right 30%
            if (touchX < screenWidth * 0.3) {
                // Left Side -> Rewind
                if (videoRef.current) videoRef.current.currentTime -= 10;
            } else if (touchX > screenWidth * 0.7) {
                // Right Side -> Forward
                if (videoRef.current) videoRef.current.currentTime += 10;
            }

            lastTapRef.current = null; // Reset
        } else {
            // First tap
            lastTapRef.current = { time: now, x: touchX };
        }
    };

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
        
        // FIX: Reset saved time so new videos start at 0
        savedTimeRef.current = 0; 

        if (videoRef.current) {
            videoRef.current.load();
            videoRef.current.playbackRate = 1;
        }
    }, [video.id, video.url]);

    // --- KEYBOARD SHORTCUTS ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 1. Ignore if user is typing in a search box or text area
            const tag = (document.activeElement?.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            if (!videoRef.current) return;
            const vid = videoRef.current;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault(); // Prevent scrolling down
                    vid.paused ? vid.play() : vid.pause();
                    break;

                case 'f':
                    e.preventDefault();
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else {
                        // Try to fullscreen the container for a better UI experience, 
                        // falling back to just the video element if container not found.
                        vid.parentElement?.requestFullscreen() || vid.requestFullscreen();
                    }
                    break;

                case 'arrowright':
                case 'l': // YouTube style forward
                    e.preventDefault();
                    vid.currentTime = Math.min(vid.duration, vid.currentTime + 10);
                    break;

                case 'arrowleft':
                case 'j': // YouTube style back
                    e.preventDefault();
                    vid.currentTime = Math.max(0, vid.currentTime - 10);
                    break;

                case 'arrowup':
                    e.preventDefault();
                    vid.volume = Math.min(1, vid.volume + 0.1);
                    break;

                case 'arrowdown':
                    e.preventDefault();
                    vid.volume = Math.max(0, vid.volume - 0.1);
                    break;

                case 'm':
                    e.preventDefault();
                    vid.muted = !vid.muted;
                    break;

                case 'home':
                    e.preventDefault();
                    vid.currentTime = 0;
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // --- AUTOPLAY COUNTDOWN LOGIC ---
    useEffect(() => {
        if (countdown !== null && countdown > 0) {
            timerRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
        } else if (countdown === 0) {
            onNextVideo();
            setCountdown(null);
        }
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [countdown, onNextVideo]);

    const handleVideoEnded = () => {
        // Only trigger if enabled and there is actually a next video
        if (isAutoplayEnabled && hasNext) {
            setCountdown(5); // 5 second lead time
        }
    };

    // Increment view count on mount
    useEffect(() => {
        // We fire-and-forget this request. We don't need to wait for the result.
        fetch(`/api/videos/${video.id}/view`, { method: 'POST' });
    }, [video.id]);

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
        // 1. CHANGED: Removed px-6 on mobile (px-0) so video touches edges. Added pt-0 on mobile.
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-0 lg:pt-8 max-w-[1600px] mx-auto px-0 lg:px-12 animate-fade-in pb-20">
            {/* Main Content */}
            <div className="lg:col-span-2">
                {/* Player Container */}
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent rounded-2xl blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-1000 hidden md:block"></div>

                    {/* 2. CHANGED: rounded-none on mobile, md:rounded-2xl on desktop */}
                    {/* 2. CHANGED: rounded-none on mobile, md:rounded-2xl on desktop */}
                    <div
                        className="relative w-full aspect-video bg-black rounded-none md:rounded-2xl overflow-hidden shadow-2xl ring-0 md:ring-1 ring-white/10 flex items-center justify-center"
                        onTouchEnd={handleTouchEnd}
                    >
                        {/* Dynamic Background */}
                        {video.thumbnail && (
                            <div
                                className="absolute inset-0 w-full h-full bg-cover bg-center blur-3xl opacity-50 scale-110 pointer-events-none"
                                style={{ backgroundImage: `url(${video.thumbnail})` }}
                            />
                        )}

                        {/* Video Element */}
                        <video
                            ref={videoRef}
                            src={isTranscoding ? `/api/transcode/${video.id}` : `/api/stream/${video.id}`}
                            controls
                            autoPlay
                            crossOrigin="anonymous"
                            className="relative z-10 w-full h-full object-contain"
                            onPause={saveProgress}
                            onError={(e) => {
                                const target = e.target as HTMLVideoElement;
                                const error = target.error;

                                if (error && (error.code === 4 || error.code === 3) && !isTranscoding) {
                                    console.log(`Playback error code ${error.code}: switching to transcode stream...`);
                                    
                                    // FIX: Save the current time!
                                    savedTimeRef.current = target.currentTime;
                                    
                                    setIsTranscoding(true);
                                } else {
                                    console.error("Unrecoverable video error:", error);
                                }
                            }}
                            onEnded={() => {
                                fetch(`/api/videos/${video.id}/progress`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ time: 0 })
                                });
                                onUpdateVideo({ ...video, playbackPosition: 0 });
                                handleVideoEnded();
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

                        {/* --- MODERN AUTOPLAY OVERLAY --- */}
                        {countdown !== null && (
                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in">
                                {/* Ambient Background Gradient Blob */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-brand-primary/10 via-transparent to-brand-accent/10 pointer-events-none" />

                                {/* The Glass Card */}
                                <div className="relative w-full max-w-sm mx-4 p-8 rounded-3xl border border-white/10 bg-black/40 shadow-2xl backdrop-blur-md overflow-hidden text-center">

                                    {/* Top Shine Line */}
                                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-primary mb-4 drop-shadow-sm">Up Next</h2>

                                    {/* CORRECTED: Uses upNextVideo logic inside the card */}
                                    <p className="text-white font-bold text-xl mb-8 line-clamp-2 leading-relaxed drop-shadow-md">
                                        {upNextVideo ? upNextVideo.name.replace(/\.[^/.]+$/, "") : "Next Video"}
                                    </p>

                                    {/* Glowing Progress Circle */}
                                    <div className="relative w-24 h-24 mx-auto flex items-center justify-center mb-8">
                                        {/* Soft Blue Glow behind the circle */}
                                        <div className="absolute inset-0 bg-brand-primary/30 blur-xl rounded-full animate-pulse" />

                                        <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                                            {/* Background Track */}
                                            <circle cx="48" cy="48" r="42" stroke="white" strokeWidth="4" fill="transparent" className="opacity-10" />
                                            {/* Moving Progress Bar */}
                                            <circle
                                                cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="4" fill="transparent"
                                                className="text-brand-primary transition-all duration-1000 ease-linear"
                                                strokeLinecap="round"
                                                strokeDasharray="264" // Calculated for r=42
                                                style={{
                                                    strokeDashoffset: 264 - (264 * (5 - countdown)) / 5
                                                }}
                                            />
                                        </svg>
                                        <span className="text-4xl font-bold text-white relative z-10 font-sans tracking-tighter">{countdown}</span>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => { setCountdown(null); onNextVideo(); }}
                                            className="w-full bg-gradient-to-r from-brand-primary to-brand-accent hover:from-brand-secondary hover:to-brand-primary text-white py-3.5 rounded-2xl font-bold transition-all shadow-lg hover:shadow-brand-primary/40 active:scale-95 border border-white/10"
                                        >
                                            Play Now
                                        </button>
                                        <button
                                            onClick={() => setCountdown(null)}
                                            className="w-full text-glass-subtext hover:text-white py-2 text-sm font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. CHANGED: Added px-4 md:px-0 to restore padding for controls on mobile */}
                <div className="px-4 md:px-0 mt-4 flex flex-wrap items-center justify-between gap-4">
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
                            onClick={() => {
                                const speeds = [0.25, 0.5, 1, 1.25, 1.5, 2];
                                const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                                setPlaybackSpeed(nextSpeed);
                                if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
                            }}
                            className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white flex items-center gap-1 min-w-[70px] justify-center"
                        >
                            <SpeedIcon />
                            <span className="text-xs font-bold">{playbackSpeed}x</span>
                        </button>

                        <button
                            onClick={() => {
                                const newState = !subtitlesEnabled;
                                setSubtitlesEnabled(newState);
                                if (videoRef.current) {
                                    for (let i = 0; i < videoRef.current.textTracks.length; i++) {
                                        videoRef.current.textTracks[i].mode = newState ? 'showing' : 'hidden';
                                    }
                                }
                            }}
                            disabled={!hasSubtitles}
                            className={`glass-button p-2 rounded-lg transition-colors ${subtitlesEnabled ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/30' : 'text-glass-subtext hover:text-white'} ${!hasSubtitles ? 'opacity-30' : ''}`}
                        >
                            <CCIcon />
                        </button>

                        {/* --- NEW: AUTOPLAY TOGGLE --- */}
                        <button
                            onClick={() => setIsAutoplayEnabled(!isAutoplayEnabled)}
                            className={`glass-button p-2 rounded-lg transition-all ${isAutoplayEnabled ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/30' : 'text-glass-subtext hover:text-white'}`}
                            title={isAutoplayEnabled ? "Autoplay is ON" : "Autoplay is OFF"}
                        >
                            <AutoplayIcon />
                        </button>

                        <div className="w-px h-6 bg-white/10 mx-1"></div>

                        <button onClick={() => stepFrame(false)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white">
                            <StepBackIcon />
                        </button>
                        <button onClick={() => stepFrame(true)} className="glass-button p-2 rounded-lg text-glass-subtext hover:text-white">
                            <StepForwardIcon />
                        </button>

                        <div className="w-px h-6 bg-white/10 mx-1"></div>

                        <button
                            onClick={isCustomThumbnail ? removeThumbnail : captureThumbnail}
                            disabled={isProcessingThumb}
                            className={`flex items-center gap-2 glass-button px-3 py-2 rounded-lg text-xs font-medium transition-colors ${isCustomThumbnail ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-glass-subtext hover:text-brand-accent'} ${isProcessingThumb ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            {isCustomThumbnail ? <XIcon /> : <CameraIcon />}
                            <span className="hidden sm:inline">
                                {isProcessingThumb ? 'Saving...' : (isCustomThumbnail ? 'Remove Thumb' : 'Thumbnail')}
                            </span>
                        </button>
                    </div>
                </div>

                {/* 4. CHANGED: Added px-4 md:px-0 to Title section */}
                <div className="px-4 md:px-0 mt-4 mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-4">{displayName}</h1>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/5">
                        <div className="flex items-center gap-4">
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

                            {/* Watch Later */}
                            <button
                                onClick={() => onToggleWatchLater?.(video.id)}
                                className={`glass-button p-2.5 rounded-full transition-all ${playlists?.find(p => p.name === 'Watch Later')?.videoIds?.includes(video.id)
                                    ? 'text-brand-primary bg-brand-primary/10 border-brand-primary/30'
                                    : 'text-glass-subtext hover:text-white'
                                    }`}
                            >
                                <HistoryIcon />
                            </button>

                            {/* Playlist Menu */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
                                    className="glass-button p-2.5 rounded-full text-glass-subtext hover:text-white transition-all"
                                >
                                    <PlaylistPlusIcon />
                                </button>
                                {showPlaylistMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowPlaylistMenu(false)} />
                                        <div className="absolute top-full right-0 mt-2 w-52 glass-panel rounded-xl shadow-2xl py-2 z-50 border border-white/10">
                                            <div className="px-4 py-2 text-[10px] font-bold text-glass-subtext uppercase tracking-widest">Select Playlist</div>
                                            <div className="max-h-48 overflow-y-auto">
                                                {playlists.map(p => {
                                                    const isAlreadyIn = p.videoIds.includes(video.id);
                                                    return (
                                                        <div
                                                            key={p.id}
                                                            onClick={() => {
                                                                if (!isAlreadyIn) onAddToPlaylist(video.id, p.id);
                                                                setShowPlaylistMenu(false);
                                                            }}
                                                            className={`px-4 py-2.5 flex items-center justify-between cursor-pointer text-sm font-medium transition-colors border-b border-white/5 last:border-0 
                                                            ${isAlreadyIn ? 'text-brand-primary bg-brand-primary/5 cursor-default' : 'hover:bg-white/10'}`}
                                                        >
                                                            <span className="truncate">{p.name}</span>
                                                            {isAlreadyIn && <div className="w-2 h-2 rounded-full bg-brand-primary" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="mt-1 pt-1 border-t border-white/10">
                                                <button
                                                    onClick={async () => {
                                                        onCreatePlaylist();
                                                        setShowPlaylistMenu(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 text-sm font-bold text-brand-accent hover:bg-white/10 transition-colors flex items-center gap-2"
                                                >
                                                    <span className="text-lg">+</span> Create New
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* YouTube Link */}
                            <div className="relative">
                                {video.youtubeId ? (
                                    <a
                                        href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center glass-button p-2.5 rounded-full text-brand-primary border-brand-primary/30 bg-brand-primary/10 hover:bg-brand-primary/20 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all animate-glow-flow"
                                    >
                                        <YouTubeIcon />
                                    </a>
                                ) : (
                                    <button disabled className="flex items-center justify-center glass-button p-2.5 rounded-full opacity-20 cursor-not-allowed grayscale border-white/5 text-glass-subtext">
                                        <YouTubeIcon />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. CHANGED: Added mx-4 md:mx-0 so description box doesn't touch edges on mobile */}
                <div className="mx-4 md:mx-0 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-4 transition-colors">
                    <div className="flex items-center gap-3 text-sm font-bold mb-3 text-white/90">
                        <span>{views}</span>
                        <span className="text-white/20">•</span>
                        <span>
                            {video.releaseDate
                                ? new Date(video.releaseDate).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    timeZone: 'UTC'
                                })
                                : timeAgo}
                        </span>
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
                {/* --- NEW: File Metadata Section --- */}
                <div className="mx-4 md:mx-0 mt-6 p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6 border-b border-white/5 pb-2">File Metadata</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8 text-xs">
                        {/* Filename (Cleaned) */}
                        <div>
                            <div className="text-glass-subtext mb-1 font-medium">Filename</div>
                            <div className="font-mono text-white/80 break-all select-all">
                                {decodeURIComponent((video as any).filename || video.name)}
                            </div>
                        </div>

                        {/* File Size (New!) */}
                        <div>
                            <div className="text-glass-subtext mb-1 font-medium">File Size</div>
                            <div className="font-mono text-white/80">
                                {fileSize || "Loading..."}
                            </div>
                        </div>

                        {/* Location (Cleaned) */}
                        <div>
                            <div className="text-glass-subtext mb-1 font-medium">Folder Location</div>
                            <div className="font-mono text-white/80 break-all">
                                {decodeURIComponent(video.folder)}
                            </div>
                        </div>

                        {/* Metadata: Date */}
                        {video.releaseDate && (
                            <div>
                                <div className="text-glass-subtext mb-1 font-medium">Metadata Date</div>
                                <div className="text-white/80 font-mono">
                                    {new Date(video.releaseDate).toLocaleDateString(undefined, { dateStyle: 'full' })}
                                </div>
                            </div>
                        )}

                        {/* Full Path (Cleaned) */}
                        <div className="sm:col-span-2">
                            <div className="text-glass-subtext mb-1 font-medium">Full System Path</div>
                            <div className="font-mono text-white/60 break-all select-all bg-black/20 p-2.5 rounded border border-white/5">
                                {decodeURIComponent(video.path)}
                            </div>
                        </div>

                        {/* Metadata: Tags/Genre */}
                        {video.genre && (
                            <div className="sm:col-span-2">
                                <div className="text-glass-subtext mb-2 font-medium">Metadata Tags</div>
                                <div className="flex flex-wrap gap-2">
                                    {video.genre.split(/[,/]/).map((tag, i) => (
                                        <span key={i} className="px-2.5 py-1 rounded-md bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-[11px] font-medium tracking-wide">
                                            {tag.trim()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sidebar Column */}
            <div className="lg:col-span-1 px-4 lg:px-0">
                <h3 className="text-lg font-bold mb-5 text-white/90 border-l-4 border-brand-primary pl-4">Up Next</h3>
                <div className="flex flex-col gap-4">
                    
                    {/* 1. THE QUEUE (Next 5 Videos) */}
                    {nextQueue.map((item, index) => (
                        <div 
                            key={`queue-${item.id}`} 
                            className={`flex gap-3 cursor-pointer group p-2 rounded-xl transition-all border border-transparent 
                                ${index === 0 ? 'bg-white/10 border-white/5' : 'hover:bg-white/5 hover:border-white/5'}
                            `} 
                            onClick={() => onVideoSelect(item)}
                        >
                            <div className="relative w-40 h-24 flex-shrink-0 bg-gray-800 rounded-lg overflow-hidden border border-white/5 shadow-md">
                                {item.thumbnail ? (
                                    <img src={item.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-300 group-hover:scale-105" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-white/5"><NextVideoIcon /></div>
                                )}
                                <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    {item.durationStr || "VIDEO"}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 min-w-0 pt-1">
                                <h4 className={`text-sm font-bold line-clamp-2 leading-snug transition-colors ${index === 0 ? 'text-brand-primary' : 'text-white/90 group-hover:text-brand-primary'}`}>
                                    {item.name.replace(/\.[^/.]+$/, "")}
                                </h4>
                                <p className="text-xs text-glass-subtext truncate">{item.folder}</p>
                                <p className="text-xs text-glass-subtext mt-auto">{item.views || formatViews()}</p>
                            </div>
                        </div>
                    ))}

                    {/* 2. THE DIVIDER (Only show if we have a queue AND related videos) */}
                    {nextQueue.length > 0 && relatedVideos.length > 0 && (
                        <div className="relative py-2 opacity-60">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-[#0a0a0a] px-3 text-[10px] text-glass-subtext uppercase tracking-widest font-bold">More Related</span>
                            </div>
                        </div>
                    )}

                    {/* 3. RELATED VIDEOS (Filtered) */}
                    {relatedVideos
                        .filter(r => !nextQueue.find(q => q.id === r.id)) // Remove duplicates
                        .map(related => (
                            <div 
                                key={`related-${related.id}`} 
                                className="flex gap-3 cursor-pointer group p-2 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5" 
                                onClick={() => onVideoSelect(related)}
                            >
                                <div className="relative w-40 h-24 flex-shrink-0 bg-gray-800 rounded-lg overflow-hidden border border-white/5 shadow-md">
                                    {related.thumbnail ? (
                                        <img src={related.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-300 group-hover:scale-105" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5"><NextVideoIcon /></div>
                                    )}
                                    <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] font-bold">
                                        {related.durationStr || "VIDEO"}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 min-w-0 pt-1">
                                    <h4 className="text-sm font-bold line-clamp-2 leading-snug text-white/90 group-hover:text-brand-primary transition-colors">
                                        {related.name.replace(/\.[^/.]+$/, "")}
                                    </h4>
                                    <p className="text-xs text-glass-subtext truncate">{related.folder}</p>
                                    <p className="text-xs text-glass-subtext mt-auto">{related.views || formatViews()}</p>
                                </div>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
};

export default VideoPlayer;

