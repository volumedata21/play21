import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useSearchParams, useParams } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VideoCard, { RecommendationRow } from './components/VideoCard';
import VideoPlayer from './components/VideoPlayer';
import { XIcon, PlaylistPlusIcon, SortIcon, ChevronDownIcon } from './components/Icons';
import { processFiles } from './services/fileService';
import SettingsModal from './components/SettingsModal';
import { getMockData } from './services/mockData';
import { VideoFile, FolderStructure, ViewState, Playlist, SortOption } from './types';
import { VirtuosoGrid } from 'react-virtuoso';

const AppContent = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [viewState, setViewState] = useState<ViewState>(ViewState.HOME);
    const [allVideos, setAllVideos] = useState<VideoFile[]>([]);
    const [folderStructure, setFolderStructure] = useState<FolderStructure>({});
    const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [sortOption, setSortOption] = useState<SortOption>(SortOption.AIR_DATE_NEWEST); const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, hasMore: true, isLoading: false });
    const [totalCount, setTotalCount] = useState(0);
    const [currentSubFolders, setCurrentSubFolders] = useState<string[]>([]);
    const [isFoldersExpanded, setIsFoldersExpanded] = useState(false);
    const [isAutoplayOn, setIsAutoplayOn] = useState(true);
    const virtuosoRef = useRef<any>(null);

    const [recommendedVideos, setRecommendedVideos] = useState<VideoFile[]>([]);
    const [hideHiddenFiles, setHideHiddenFiles] = useState(true); // Default to hiding hidden files

    const [mainScrollRef, setMainScrollRef] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const fetchDiscovery = async () => {
            try {
                const res = await fetch('/api/discovery/random');
                const data = await res.json();
                if (data.success) {
                    const mapped = data.videos.map((v: any) => ({
                        ...v,
                        url: v.path,
                        subtitles: v.subtitles ? JSON.parse(v.subtitles) : [],
                        isFavorite: Boolean(v.is_favorite)
                    }));
                    setRecommendedVideos(mapped);
                }
            } catch (e) {
                console.error("Discovery fetch failed", e);
            }
        };
        fetchDiscovery();
    }, []);

    // Features State
    const [history, setHistory] = useState<string[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);

    // Selection State
    const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
    const [showBulkPlaylistMenu, setShowBulkPlaylistMenu] = useState(false);

    // ----------------------------------------------------------------
    // DATABASE CONNECTION CODE
    // ----------------------------------------------------------------

    // NEW: Added searchTerm argument (defaults to empty string)
    const fetchVideos = async (page = 1, folder: string | null = null, reset = false, search = '') => {
        // Prevent duplicate loads
        if (!reset && (pagination.isLoading || !pagination.hasMore)) return;

        setPagination(prev => ({ ...prev, isLoading: true }));

        try {
            const url = new URL('/api/videos', window.location.origin);
            url.searchParams.set('page', page.toString());
            url.searchParams.set('limit', '50');
            url.searchParams.set('sort', sortOption);

            if (folder) url.searchParams.set('folder', folder);
            if (search) url.searchParams.set('search', search);
            url.searchParams.set('hideHidden', hideHiddenFiles.toString()); // Tell the server our preference

            const response = await fetch(url.toString());
            const data = await response.json();

            // Process subtitles (safe parsing)
            // Process subtitles and database favorites
            const newVideos = data.videos.map((v: any) => {
                let parsedSubtitles = [];
                try {
                    if (v.subtitles && typeof v.subtitles === 'string') parsedSubtitles = JSON.parse(v.subtitles);
                } catch (e) { }

                return {
                    ...v,
                    url: v.path,
                    subtitles: parsedSubtitles,
                    // NEW: Convert SQLite 1/0 to true/false so the UI stays starred
                    isFavorite: Boolean(v.is_favorite)
                };
            });

            if (reset) {
                setAllVideos(newVideos);
                setTotalCount(data.pagination.total);
                setPagination({
                    page: 2, // Next page will be 2
                    hasMore: data.pagination.totalPages > 1,
                    isLoading: false
                });
            } else {
                setAllVideos(prev => [...prev, ...newVideos]);
                setPagination(prev => ({
                    ...prev,
                    page: prev.page + 1,
                    hasMore: page < data.pagination.totalPages,
                    isLoading: false
                }));
            }
        } catch (error) {
            console.log("Backend error", error);
            setPagination(prev => ({ ...prev, isLoading: false }));
        }
    };

    // Trigger the fetch when the app first loads
    // 1. Initial Load
    // 1. Initial Load
    // 1. Initial Load
    useEffect(() => {
        fetchVideos(1, null, true);
        fetchFolderList();

        // NEW: This function talks to your database to get your saved data
        const loadPersistedData = async () => {
            try {
                // Get Playlists from the database
                const plRes = await fetch('/api/playlists');
                const plData = await plRes.json();
                setPlaylists(plData.playlists);

                // Get Watch History from the database
                const histRes = await fetch('/api/history');
                const histData = await histRes.json();
                setHistory(histData.history);
            } catch (e) {
                console.error("Failed to load persistence layer", e);
            }
        };
        loadPersistedData();
    }, []);

    useEffect(() => {
        if (viewState === ViewState.WATCH && mainScrollRef) {
            // Use 'auto' for instant snap, preventing the 'jumpy' feeling
            mainScrollRef.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [currentVideo, viewState, mainScrollRef]);

    useEffect(() => {
        // When the user changes the sort, clear the list and start from page 1
        fetchVideos(1, selectedFolder, true);
    }, [sortOption]);

    const fetchFolderList = async (parent: string | null = null) => {
        try {
            const url = new URL('/api/folders', window.location.origin);
            if (parent) url.searchParams.set('parent', parent);

            const res = await fetch(url.toString());
            const data = await res.json();

            if (parent) {
                // Main View: Store the full object (name + image)
                setCurrentSubFolders(data.folders);
                setIsFoldersExpanded(false);
            } else {
                // Sidebar: Just needs the names for the tree
                const structure: any = {};

                // --- THIS IS THE FIX ---
                data.folders.forEach((f: any) => {
                    // If the server sends an object {name: "Action", image: "..."}, grab just the name.
                    // If it sends just a string "Action", use it as is.
                    const folderName = typeof f === 'object' ? f.name : f;
                    structure[folderName] = [];
                });

                setFolderStructure(structure);
            }
        } catch (e) {
            console.error("Failed to load folders", e);
        }
    };


    // 2. When Folder OR Search Changes (Reset and Fetch)
    useEffect(() => {
        if (viewState === ViewState.HOME) {
            // Debounce: Wait 300ms after user stops typing to avoid too many requests
            const timeoutId = setTimeout(() => {
                // Pass the current searchTerm here
                fetchVideos(1, selectedFolder, true, searchTerm);

                // Fetch sub-folders logic...
                if (selectedFolder) {
                    fetchFolderList(selectedFolder);
                } else {
                    setCurrentSubFolders([]);
                }
            }, 300);

            return () => clearTimeout(timeoutId);
        }
    }, [selectedFolder, searchTerm]);

    // --- ROUTER SYNC LOGIC ---
    useEffect(() => {
        const path = location.pathname;
        const queryFolder = searchParams.get('folder');

        // 1. WATCH PAGE
        if (path.startsWith('/watch/')) {
            const videoId = path.split('/')[2];
            // If we are already watching this video, don't do anything
            if (currentVideo?.id !== videoId) {
                // FIX: Look in 'allVideos' AND 'recommendedVideos'
                const vid = allVideos.find(v => v.id === videoId) ||
                    recommendedVideos.find(v => v.id === videoId);

                if (vid) {
                    setCurrentVideo(vid);
                    setViewState(ViewState.WATCH);
                    setIsSidebarOpen(false);
                }
            }
        }
        // 2. PLAYLIST PAGE
        else if (path.startsWith('/playlist/')) {
            const playlistId = path.split('/')[2];
            setSelectedPlaylistId(playlistId);
            setViewState(ViewState.PLAYLIST);
            setCurrentVideo(null);
        }
        // 3. HOME / FOLDER PAGE
        else {
            setViewState(ViewState.HOME);
            setCurrentVideo(null);

            // Handle Folder Logic
            if (queryFolder) {
                setSelectedFolder(queryFolder);
            } else {
                setSelectedFolder(null);
            }
        }
        // FIX: Add 'recommendedVideos' to the dependency array so it re-runs when they load
    }, [location.pathname, searchParams, allVideos, recommendedVideos]);

    const handleScanLibrary = async () => {
        setIsScanning(true);
        try {
            // 1. Tell server to scan
            await fetch('/api/scan', { method: 'POST' });

            // 2. Fetch the updated list (Use the new function!)
            // Reset to page 1, current folder, true = reset list
            await fetchVideos(1, selectedFolder, true);
        } catch (e) {
            console.error("Scan failed", e);
        } finally {
            setIsScanning(false);
        }
    };

    // Handle file selection
    const handleFilesSelected = (fileList: FileList) => {
        allVideos.forEach(v => {
            if (v.file) URL.revokeObjectURL(v.url);
        });

        const { videos, structure } = processFiles(fileList);
        setAllVideos(videos);
        setFolderStructure(structure);
        setViewState(ViewState.HOME);
        setCurrentVideo(null);
        setSelectedVideoIds(new Set());
    };

    const handleLoadDemo = () => {
        allVideos.forEach(v => {
            if (v.file) URL.revokeObjectURL(v.url);
        });

        const { videos, structure } = getMockData();
        setAllVideos(videos);
        setFolderStructure(structure);
        setViewState(ViewState.HOME);
        setCurrentVideo(null);
        setPlaylists([
            { id: 'p1', name: 'Watch Later', videoIds: [] },
            { id: 'p2', name: 'Cool Animations', videoIds: ['mock-1', 'mock-2'] }
        ]);
        setSelectedVideoIds(new Set());
    };

    // --- UPDATED NAVIGATION LOGIC ---
    const { displayedVideos, canGoUp } = useMemo(() => {
        let videos = allVideos;
        let showGoUp = false;

        // 1. Filter by View State
        if (viewState === ViewState.FAVORITES) {
            videos = videos.filter(v => v.isFavorite);
        } else if (viewState === ViewState.HISTORY) {
            const historyVideos = history.map(id => allVideos.find(v => v.id === id)).filter(Boolean) as VideoFile[];
            videos = [...historyVideos].reverse();
        } else if (viewState === ViewState.PLAYLIST && selectedPlaylistId) {
            const playlist = playlists.find(p => p.id === selectedPlaylistId);
            videos = playlist ? playlist.videoIds.map(id => allVideos.find(v => v.id === id)).filter(Boolean) as VideoFile[] : [];
        }

        // 2. FOLDER NAVIGATION (Simplified)
        else if (selectedFolder) {
            showGoUp = selectedFolder.includes('/');

            // Just filter videos, don't calculate subfolders here anymore
            videos = videos.filter(v => {
                const isExactMatch = v.folder === selectedFolder;
                const isSubFolder = v.folder.startsWith(selectedFolder + '/');
                return isExactMatch || isSubFolder;
            });
        }

        // 4. Sorting
        const sortedVideos = [...videos].sort((a, b) => {
            switch (sortOption) {
                case SortOption.NAME_ASC: return a.name.localeCompare(b.name);
                case SortOption.NAME_DESC: return b.name.localeCompare(a.name);
                case SortOption.DATE_NEWEST: return (b.createdAt || 0) - (a.createdAt || 0);
                case SortOption.DATE_OLDEST: return (a.createdAt || 0) - (b.createdAt || 0);
                case SortOption.VIEWS_MOST: return (b.viewsCount || 0) - (a.viewsCount || 0);
                case SortOption.VIEWS_LEAST: return (a.viewsCount || 0) - (b.viewsCount || 0);
                case SortOption.DURATION_LONGEST: return (b.duration || 0) - (a.duration || 0);
                case SortOption.DURATION_SHORTEST: return (a.duration || 0) - (b.duration || 0);
                case SortOption.AIR_DATE_NEWEST:
                    return (b.releaseDate || '').localeCompare(a.releaseDate || '');
                case SortOption.AIR_DATE_OLDEST:
                    return (a.releaseDate || '').localeCompare(b.releaseDate || '');
                default: return 0;
            }
        });

        return { displayedVideos: sortedVideos, canGoUp: showGoUp };
    }, [allVideos, selectedFolder, searchTerm, viewState, history, playlists, selectedPlaylistId, sortOption]);
    // --- NEW NAVIGATION HANDLERS ---

    const handleEnterFolder = (subFolderName: string) => {
        const newPath = `${selectedFolder ? selectedFolder + '/' : ''}${subFolderName}`;
        // Navigate to the same page but with a new query parameter
        navigate(`/?folder=${encodeURIComponent(newPath)}`);
    };

    const handleGoUp = () => {
        if (!selectedFolder) return;
        const parent = selectedFolder.split('/').slice(0, -1).join('/');

        if (parent) {
            navigate(`/?folder=${encodeURIComponent(parent)}`);
        } else {
            navigate('/');
        }
    };

    const handleVideoSelect = (video: VideoFile) => {
        // 1. Update History Database
        setHistory(prev => {
            const newHistory = prev.filter(id => id !== video.id);
            return [...newHistory, video.id];
        });

        fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: video.id })
        });

        // 2. Navigate to the Watch URL
        navigate(`/watch/${video.id}`);
    };


    const toggleSelection = (id: string) => {
        setSelectedVideoIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const clearSelection = () => {
        setSelectedVideoIds(new Set());
        setShowBulkPlaylistMenu(false);
    };

    const handleBulkAddToPlaylist = async (playlistId: string) => {
        // NEW: Convert the 'Set' of IDs into an array so we can loop through them
        const videoIdsArray = Array.from(selectedVideoIds);

        // NEW: For every video ID you selected, tell the database to add it to the playlist
        for (const videoId of videoIdsArray) {
            await fetch(`/api/playlists/${playlistId}/videos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId })
            });
        }

        // Update the screen so the user sees the videos appear in the playlist
        setPlaylists(prev => prev.map(p => {
            if (p.id === playlistId) {
                const newIds = new Set([...p.videoIds, ...videoIdsArray]);
                return { ...p, videoIds: Array.from(newIds) };
            }
            return p;
        }));
        clearSelection();
    };

    const handleNextVideo = () => {
        if (!currentVideo) return;
        const currentIndex = displayedVideos.findIndex(v => v.id === currentVideo.id);
        if (currentIndex !== -1 && currentIndex < displayedVideos.length - 1) {
            handleVideoSelect(displayedVideos[currentIndex + 1]);
        }
    };

    const handlePrevVideo = () => {
        if (!currentVideo) return;
        const currentIndex = displayedVideos.findIndex(v => v.id === currentVideo.id);
        if (currentIndex > 0) {
            handleVideoSelect(displayedVideos[currentIndex - 1]);
        }
    };

    const hasNext = useMemo(() => {
        if (!currentVideo) return false;
        const currentIndex = displayedVideos.findIndex(v => v.id === currentVideo.id);
        return currentIndex !== -1 && currentIndex < displayedVideos.length - 1;
    }, [currentVideo, displayedVideos]);

    const hasPrev = useMemo(() => {
        if (!currentVideo) return false;
        const currentIndex = displayedVideos.findIndex(v => v.id === currentVideo.id);
        return currentIndex > 0;
    }, [currentVideo, displayedVideos]);


    const handleUpdateVideo = (updated: VideoFile) => {
        setAllVideos(prev => prev.map(v => v.id === updated.id ? updated : v));
        setCurrentVideo(updated);
    };

    const handleCreatePlaylist = async () => {
        const name = window.prompt("Enter Playlist Name:");
        if (name) {
            const res = await fetch('/api/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();

            if (data.success) {
                const newPlaylist = data.playlist;

                // NEW: If we are currently in WATCH mode, add this video to the new playlist automatically
                if (viewState === ViewState.WATCH && currentVideo) {
                    await handleAddToPlaylist(currentVideo.id, newPlaylist.id);
                    // Update the local object so the checkmark appears immediately
                    newPlaylist.videoIds = [currentVideo.id];
                }

                setPlaylists([...playlists, newPlaylist]);
            }
        }
    };

    const handleAddToPlaylist = async (videoId: string, playlistId: string) => {
        // NEW: Tell the database to link this video to this playlist
        await fetch(`/api/playlists/${playlistId}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId })
        });

        // Update the screen so the user sees the change
        setPlaylists(prev => prev.map(p => {
            if (p.id === playlistId && !p.videoIds.includes(videoId)) {
                return { ...p, videoIds: [...p.videoIds, videoId] };
            }
            return p;
        }));
    };

    const handleToggleWatchLater = async (videoId: string) => {
        // 1. Try to find the playlist
        let watchLater = playlists.find(p => p.name === 'Watch Later');

        // 2. If it doesn't exist, create it automatically
        if (!watchLater) {
            try {
                const res = await fetch('/api/playlists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'Watch Later' })
                });
                const data = await res.json();

                if (data.success) {
                    watchLater = data.playlist;
                    // Add the new playlist to local state so the UI updates
                    setPlaylists(prev => [...prev, data.playlist]);
                } else {
                    return; // Stop if creation failed
                }
            } catch (e) {
                console.error("Failed to auto-create Watch Later", e);
                return;
            }
        }

        // 3. Now perform the toggle as usual
        const isAdded = watchLater.videoIds.includes(videoId);

        if (isAdded) {
            await fetch(`/api/playlists/${watchLater.id}/videos/${videoId}`, { method: 'DELETE' });
            setPlaylists(prev => prev.map(p => p.id === watchLater!.id
                ? { ...p, videoIds: p.videoIds.filter(id => id !== videoId) }
                : p
            ));
        } else {
            await handleAddToPlaylist(videoId, watchLater.id);
            // Note: handleAddToPlaylist already updates the playlists state
        }
    };

    const handleGoHome = () => {
        setSearchTerm('');
        navigate('/');
    };
    const relatedVideos = useMemo(() => {
        if (!currentVideo) return [];

        const sameFolder = allVideos.filter(v => v.folder === currentVideo.folder && v.id !== currentVideo.id);
        const others = allVideos.filter(v => v.folder !== currentVideo.folder && v.id !== currentVideo.id);
        return [...sameFolder, ...others].slice(0, 10);
    }, [currentVideo, allVideos]);

    // --- SIDEBAR WRAPPERS ---
    // Removed duplicate handleSidebarViewChange

    const handleSidebarViewChange = (newView: ViewState) => {
        setViewState(newView);
        navigate('/');
    };

    const handleSidebarFolderSelect = (folder: string | null) => {
        if (folder) {
            navigate(`/?folder=${encodeURIComponent(folder)}`);
        } else {
            navigate('/');
        }
    };

    const handleSidebarPlaylistSelect = (id: string) => {
        navigate(`/playlist/${id}`);
    };

    // Removed the problematic legacy pushState handlers here

    return (
        <div className="h-screen w-full text-glass-text font-sans selection:bg-brand-primary selection:text-white overflow-hidden">
            <Header
                onTriggerScan={handleScanLibrary}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                goHome={handleGoHome}
                isScanning={isScanning}
                isAutoplayOn={isAutoplayOn}
                onToggleAutoplay={() => setIsAutoplayOn(!isAutoplayOn)}
            />

            <div className="pt-16 h-full flex relative">
                <Sidebar
                    isOpen={isSidebarOpen}
                    folders={folderStructure}
                    playlists={playlists}
                    viewState={viewState}
                    selectedFolder={selectedFolder}
                    selectedPlaylistId={selectedPlaylistId}
                    onSelectFolder={handleSidebarFolderSelect}
                    onSelectView={handleSidebarViewChange}
                    onSelectPlaylist={handleSidebarPlaylistSelect}
                    onCreatePlaylist={handleCreatePlaylist}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onClose={() => setIsSidebarOpen(false)}
                />

                <main
                    ref={setMainScrollRef}
                    className={`flex-1 h-full overflow-y-auto transition-all duration-300 ${viewState !== ViewState.WATCH && isSidebarOpen ? 'md:ml-64' : ''}`}
                >
                    {/* 1. Show Welcome if no videos are loaded yet */}
                    {allVideos.length === 0 && !pagination.isLoading && (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in-up">
                            <div className="w-32 h-32 bg-gradient-to-tr from-brand-accent/20 to-brand-primary/20 rounded-full flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(59,130,246,0.15)] ring-1 ring-white/10">
                                <svg className="w-16 h-16 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h2 className="text-4xl font-bold mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-brand-primary/50">Welcome to Play21</h2>
                            <button onClick={handleLoadDemo} className="bg-brand-primary text-white px-8 py-3.5 rounded-xl font-bold">View Demo Gallery</button>
                        </div>
                    )}

                    {/* 2. Main Library Grid */}
                    {viewState !== ViewState.WATCH && allVideos.length > 0 && (
                        <div className="p-6 md:p-8 animate-fade-in min-h-full">
                            <div className="mb-6 border-b border-white/5 pb-4">
                                <h2 className="text-2xl font-bold text-white capitalize">
                                    {viewState === ViewState.HOME ? (selectedFolder || 'All Videos') : viewState.toLowerCase()}
                                </h2>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-6">
                                {displayedVideos.map(video => (
                                    <VideoCard key={video.id} video={video} onClick={() => handleVideoSelect(video)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 3. Video Player View */}
                    {viewState === ViewState.WATCH && currentVideo && (
                        <VideoPlayer
                            video={currentVideo}
                            relatedVideos={relatedVideos}
                            playlists={playlists}
                            hasNext={hasNext}
                            hasPrev={hasPrev}
                            onVideoSelect={handleVideoSelect}
                            onUpdateVideo={handleUpdateVideo}
                            onAddToPlaylist={handleAddToPlaylist}
                            onToggleWatchLater={handleToggleWatchLater}
                            onNextVideo={handleNextVideo}
                            onPrevVideo={handlePrevVideo}
                            onCreatePlaylist={handleCreatePlaylist}
                            autoplay={isAutoplayOn}
                        />
                    )}
                </main>

                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    hideHiddenFiles={hideHiddenFiles}
                    setHideHiddenFiles={(val) => {
                        setHideHiddenFiles(val);
                        // This refreshes the video list immediately when you toggle the setting
                        fetchVideos(1, selectedFolder, true, searchTerm);
                    }}
                />
            </div>
        </div>
    );


};

const App = () => {
    return (
        <BrowserRouter>
            <AppContent />
        </BrowserRouter>
    );
};

export default App;