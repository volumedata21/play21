import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useSearchParams, useParams } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import VideoCard, { RecommendationRow } from './components/VideoCard';
import VideoPlayer from './components/VideoPlayer';
import { XIcon, PlaylistPlusIcon, SortIcon, ChevronDownIcon } from './components/Icons';
import { processFiles } from './services/fileService';
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    const [isScanning, setIsScanning] = useState(false);
    const [sortOption, setSortOption] = useState<SortOption>(SortOption.AIR_DATE_NEWEST); const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, hasMore: true, isLoading: false });
    const [totalCount, setTotalCount] = useState(0);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [appSettings, setAppSettings] = useState({ hideHiddenFiles: true });
    const [currentSubFolders, setCurrentSubFolders] = useState<string[]>([]);
    const [isFoldersExpanded, setIsFoldersExpanded] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const virtuosoRef = useRef<any>(null);

    const [recommendedVideos, setRecommendedVideos] = useState<VideoFile[]>([]);

    const [mainScrollRef, setMainScrollRef] = useState<HTMLElement | null>(null);

    const virtuosoComponents = useMemo(() => ({
        List: React.forwardRef(({ style, children, ...props }: any, ref) => (
            <div
                ref={ref}
                {...props}
                style={style}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-6 pr-4"
            >
                {children}
            </div>
        ))
    }), []);

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
    const fetchVideos = async (page = 1, folder: string | null = null, reset = false, search = '', favoritesOnly = false) => {
        // Prevent duplicate loads (only if not resetting)
        if (!reset && (pagination.isLoading || !pagination.hasMore)) return;

        // CRITICAL FIX: Cancel any previous pending request
        if (reset && abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create a new controller for this specific request
        const controller = new AbortController();
        if (reset) abortControllerRef.current = controller;

        setPagination(prev => ({ ...prev, isLoading: true }));

        try {
            const url = new URL('/api/videos', window.location.origin);
            url.searchParams.set('page', page.toString());
            url.searchParams.set('limit', '50');
            url.searchParams.set('sort', sortOption);
            url.searchParams.set('hideHidden', appSettings.hideHiddenFiles.toString());

            if (folder) url.searchParams.set('folder', folder);
            if (search) url.searchParams.set('search', search);
            if (favoritesOnly) url.searchParams.set('favorites', 'true');

            // Pass the "signal" to fetch so we can cancel it
            const response = await fetch(url.toString(), { signal: controller.signal });
            const data = await response.json();

            const newVideos = data.videos.map((v: any) => {
                let parsedSubtitles = [];
                try {
                    if (v.subtitles && typeof v.subtitles === 'string') parsedSubtitles = JSON.parse(v.subtitles);
                } catch (e) { }

                return {
                    ...v,
                    url: v.path,
                    subtitles: parsedSubtitles,
                    isFavorite: Boolean(v.is_favorite)
                };
            });

            if (reset) {
                setAllVideos(newVideos);
                setTotalCount(data.pagination.total);
                setPagination({
                    page: 2,
                    hasMore: data.pagination.totalPages > 1,
                    isLoading: false
                });
            } else {
                setAllVideos(prev => {
                    const existingIds = new Set(prev.map(v => v.id));
                    const uniqueNewVideos = newVideos.filter((v: any) => !existingIds.has(v.id));
                    return [...prev, ...uniqueNewVideos];
                });
                
                setPagination(prev => ({
                    ...prev,
                    page: prev.page + 1,
                    hasMore: page < data.pagination.totalPages,
                    isLoading: false
                }));
            }
        } catch (error: any) {
            // Ignore errors caused by us cancelling the request
            if (error.name === 'AbortError') return;
            
            console.log("Backend error", error);
            setPagination(prev => ({ ...prev, isLoading: false }));
        }
    };

    const handleToggleSetting = async (key: string, value: boolean) => {
        // 1. Update Local State
        setAppSettings(prev => ({ ...prev, [key]: value }));

        // 2. Persist to Server
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });

        // 3. Refetch videos to apply change immediately
        if (key === 'hideHiddenFiles') {
            fetchVideos(1, selectedFolder, true, searchTerm);
        }
    };

    // Trigger the fetch when the app first loads
    useEffect(() => {
        fetchVideos(1, null, true);
        fetchFolderList();

        // NEW: This function talks to your database to get your saved data
        const loadPersistedData = async () => {
            try {
                // Get Playlists
                const plRes = await fetch('/api/playlists');
                const plData = await plRes.json();
                if (plData.playlists) setPlaylists(plData.playlists);

                // Get Watch History
                const histRes = await fetch('/api/history');
                const histData = await histRes.json();
                if (histData.history) setHistory(histData.history);

                // Get Settings
                const setRes = await fetch('/api/settings');
                const setData = await setRes.json();
                if (setData.hideHiddenFiles !== undefined) {
                    setAppSettings(prev => ({ ...prev, hideHiddenFiles: setData.hideHiddenFiles === 'true' }));
                }
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


    // UPDATED: Handle data fetching when ViewState or Folder changes
    useEffect(() => {
        const isFavorites = viewState === ViewState.FAVORITES;

        // Debounce search
        const timeoutId = setTimeout(() => {
            // If we are in Favorites mode, pass 'true' as the 5th argument
            fetchVideos(1, selectedFolder, true, searchTerm, isFavorites);

            if (selectedFolder && !isFavorites) {
                fetchFolderList(selectedFolder);
            } else {
                setCurrentSubFolders([]);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [selectedFolder, searchTerm, viewState]); // Added viewState dependency

    // --- ROUTER SYNC LOGIC (FIXED) ---
    useEffect(() => {
        const path = location.pathname;
        const queryFolder = searchParams.get('folder');

        // 1. WATCH PAGE
        if (path.startsWith('/watch/')) {
            const videoId = path.split('/')[2];

            // A. Check if we have it in memory
            const vid = allVideos.find(v => v.id === videoId) ||
                recommendedVideos.find(v => v.id === videoId);

            if (vid) {
                setCurrentVideo(vid);
                setViewState(ViewState.WATCH);
                setIsSidebarOpen(false);
            } else {
                // B. CRITICAL FIX: Fetch specific video if not found in list (e.g. on Refresh)
                fetch(`/api/videos/${videoId}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.error) {
                            console.error("Video not found on server");
                            navigate('/'); // Send home if invalid ID
                        } else {
                            // Normalize the data to match your types
                            const videoData = {
                                ...data,
                                url: data.path, // server returns path, ui needs url
                                subtitles: typeof data.subtitles === 'string' ? JSON.parse(data.subtitles) : []
                            };
                            setCurrentVideo(videoData);
                            setViewState(ViewState.WATCH);
                            setIsSidebarOpen(false);
                        }
                    })
                    .catch(e => console.error("Single video fetch failed", e));
            }
        }
        // 2. PLAYLIST PAGE
        else if (path.startsWith('/playlist/')) {
            const playlistId = path.split('/')[2];
            setSelectedPlaylistId(playlistId);
            setViewState(ViewState.PLAYLIST);
            setCurrentVideo(null);
        }

        // NEW: FAVORITES PAGE
        else if (path === '/favorites') {
            setViewState(ViewState.FAVORITES);
            setCurrentVideo(null);
            // We don't fetch here directly; the useEffect below handles the data fetch
            // based on the viewState change.
        }

        // 3. HOME / FOLDER PAGE
        else {
            setViewState(ViewState.HOME);
            setCurrentVideo(null);
            if (queryFolder) setSelectedFolder(queryFolder);
            else setSelectedFolder(null);
        }
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
            // History needs to respect the order of the history array (newest watched first)
            // This is the ONLY time we sort on client side
            const historyMap = new Map(allVideos.map(v => [v.id, v]));
            videos = history.map(id => historyMap.get(id)).filter(Boolean) as VideoFile[];
        } else if (viewState === ViewState.PLAYLIST && selectedPlaylistId) {
            const playlist = playlists.find(p => p.id === selectedPlaylistId);
            videos = playlist ? playlist.videoIds.map(id => allVideos.find(v => v.id === id)).filter(Boolean) as VideoFile[] : [];
        }

        // 2. FOLDER NAVIGATION
        else if (selectedFolder) {
            showGoUp = selectedFolder.includes('/');
            videos = videos.filter(v => {
                const isExactMatch = v.folder === selectedFolder;
                const isSubFolder = v.folder.startsWith(selectedFolder + '/');
                return isExactMatch || isSubFolder;
            });
        }

        // REMOVED: Client-side sorting switch. We rely on the server (SQL) to return the correct order.

        return { displayedVideos: videos, canGoUp: showGoUp };
    }, [allVideos, selectedFolder, searchTerm, viewState, history, playlists, selectedPlaylistId]); // removed sortOption dependency
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

        // Look in displayed videos first
        const currentIndex = displayedVideos.findIndex(v => v.id === currentVideo.id);
        if (currentIndex !== -1 && currentIndex < displayedVideos.length - 1) {
            handleVideoSelect(displayedVideos[currentIndex + 1]);
            return;
        }

        // Fallback: If not in the main list, play the first "Related Video"
        if (relatedVideos.length > 0) {
            handleVideoSelect(relatedVideos[0]);
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
        if (newView === ViewState.FAVORITES) {
            navigate('/favorites');
        } else {
            setViewState(newView);
            navigate('/');
        }
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

                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    settings={appSettings}
                    onToggleSetting={handleToggleSetting}
                />


                {/* 1. Added ref={setMainScrollRef} here so Virtuoso knows this is the scroller */}
                <main
                    ref={setMainScrollRef}
                    className={`flex-1 h-full overflow-y-auto transition-all duration-300 ${viewState !== ViewState.WATCH && isSidebarOpen ? 'md:ml-64' : ''}`}
                >

                    {/* Only show welcome if empty AND not loading AND we are at the root (not searching/in folder) */}
                    {allVideos.length === 0 && !pagination.isLoading && !searchTerm && !selectedFolder && (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in-up">
                            <div className="w-32 h-32 bg-gradient-to-tr from-brand-accent/20 to-brand-primary/20 rounded-full flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(59,130,246,0.15)] ring-1 ring-white/10">
                                <svg className="w-16 h-16 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h2 className="text-4xl font-bold mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-brand-primary/50">Welcome to Play21</h2>
                            <p className="text-glass-subtext mb-8 max-w-lg text-lg leading-relaxed">
                                A personal streaming experience for your local files.
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={handleLoadDemo}
                                    className="bg-brand-primary hover:bg-brand-secondary text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-brand-primary/25 hover:shadow-brand-primary/40 hover:-translate-y-1 active:translate-y-0"
                                >
                                    View Demo Gallery
                                </button>
                            </div>
                            <p className="mt-8 text-xs text-glass-subtext/50">To open local files, use the "Open Folder" button in the top right.</p>
                        </div>
                    )}



                    {viewState !== ViewState.WATCH && allVideos.length > 0 && (
                        <div className="p-6 md:p-8 animate-fade-in min-h-full">
                            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                                <div className="flex items-baseline gap-3">
                                    <h2 className="text-2xl font-bold text-white capitalize">
                                        {viewState === ViewState.HOME ? (selectedFolder || 'All Videos') :
                                            viewState === ViewState.PLAYLIST ? playlists.find(p => p.id === selectedPlaylistId)?.name :
                                                viewState.toLowerCase()}
                                    </h2>
                                    <span className="text-sm text-glass-subtext">{totalCount} videos</span>
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                                        className="flex items-center gap-2 glass-button px-4 py-2 rounded-lg text-sm font-medium text-glass-text hover:text-white transition-colors"
                                    >
                                        <SortIcon />
                                        <span>{sortOption}</span>
                                        <ChevronDownIcon />
                                    </button>

                                    {isSortMenuOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-56 glass-panel rounded-xl shadow-xl py-2 z-50 flex flex-col max-h-80 overflow-y-auto">
                                            <div onClick={() => setIsSortMenuOpen(false)} className="fixed inset-0 z-40 bg-transparent" />
                                            <div className="relative z-50">
                                                {Object.values(SortOption).map(option => (
                                                    <button
                                                        key={option}
                                                        onClick={() => { setSortOption(option); setIsSortMenuOpen(false); }}
                                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 transition-colors ${sortOption === option ? 'text-brand-primary font-bold bg-brand-primary/10' : 'text-glass-text'}`}
                                                    >
                                                        {option}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* --- NAVIGATION HEADER (Go Up Button) --- */}
                            {canGoUp && (
                                <button
                                    onClick={handleGoUp}
                                    className="mb-6 flex items-center gap-2 text-sm font-bold text-brand-primary hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg self-start"
                                >
                                    <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                    <span>Back to Parent Folder</span>
                                </button>
                            )}

                            {/* --- SLEEK SQUARE FOLDERS --- */}
                            {currentSubFolders.length > 0 && (
                                <div className="mb-8 animate-fade-in">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-9">
                                            <div className="bg-brand-primary/10 p-1.5 rounded-lg text-brand-primary">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                                            </div>
                                            <h3 className="text-xs font-bold text-white uppercase">
                                                Folders <span className="text-glass-subtext ml-1">({currentSubFolders.length})</span>
                                            </h3>
                                        </div>

                                        {currentSubFolders.length > 6 && (
                                            <button
                                                onClick={() => setIsFoldersExpanded(!isFoldersExpanded)}
                                                className="text-xs text-brand-primary hover:text-white transition-colors font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-white/5"
                                            >
                                                {isFoldersExpanded ? 'Show Less' : 'Show All'}
                                                <ChevronDownIcon className={`w-3 h-3 transition-transform ${isFoldersExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        )}
                                    </div>

                                    <div className={`grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 transition-all duration-500 ${isFoldersExpanded ? '' : 'max-h-[100px] overflow-hidden'}`}>
                                        {currentSubFolders.map((folder: any) => {
                                            // Handle both legacy strings and new object format
                                            const folderName = folder.name || folder;
                                            const folderImage = folder.image || null;

                                            return (
                                                <div
                                                    key={folderName}
                                                    onClick={() => handleEnterFolder(folderName)}
                                                    className="group relative aspect-square bg-gradient-to-br from-white/10 to-transparent border border-white/5 hover:border-brand-primary/50 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] overflow-hidden"
                                                >
                                                    {/* NEW: Background Image Support */}
                                                    {folderImage ? (
                                                        <>
                                                            <img
                                                                src={folderImage}
                                                                alt={folderName}
                                                                className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity duration-300"
                                                            />
                                                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                                                        </>
                                                    ) : (
                                                        <div className="absolute inset-0 bg-brand-primary/0 group-hover:bg-brand-primary/5 transition-colors duration-300" />
                                                    )}

                                                    {/* Icon (Only show if no image) */}
                                                    {!folderImage && (
                                                        <div className="mb-3 p-3 rounded-full bg-black/20 group-hover:bg-brand-primary/20 text-brand-primary/70 group-hover:text-brand-primary transition-all duration-300 shadow-inner relative z-10">
                                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                                                        </div>
                                                    )}

                                                    <span className="relative z-10 text-xs font-bold text-white text-center px-3 w-full truncate drop-shadow-md">
                                                        {folderName}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* --- SPLIT GRID WITH RECOMMENDED ROW --- */}
                            {displayedVideos.length > 0 && (
                                <div className="pb-20">
                                    {/* Static Row 1 & 2 (Changed to 3 cols to match bottom) */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-10 gap-x-6 mb-10 pr-4">
                                        {displayedVideos.slice(0, 6).map(video => (
                                            <VideoCard
                                                key={video.id}
                                                video={video}
                                                isSelected={selectedVideoIds.has(video.id)}
                                                onSelect={() => toggleSelection(video.id)}
                                                onClick={() => handleVideoSelect(video)}
                                            />
                                        ))}
                                    </div>

                                    {/* The New Horizontal Discovery Row */}
                                    {recommendedVideos.length > 0 && viewState === ViewState.HOME && !selectedFolder && (
                                        <RecommendationRow
                                            videos={recommendedVideos}
                                            onVideoSelect={handleVideoSelect}
                                        />
                                    )}

                                    {/* The Remaining Library - FIXED: uses customScrollParent */}
                                    {mainScrollRef && displayedVideos.length > 6 && (
                                        <div className="w-full">
                                            <VirtuosoGrid
                                                customScrollParent={mainScrollRef}
                                                data={displayedVideos.slice(6)}
                                                endReached={() => fetchVideos(pagination.page, selectedFolder, false, searchTerm)}
                                                overscan={200}
                                                components={virtuosoComponents} // <--- USE THE MEMOIZED VARIABLE
                                                itemContent={(index, video) => (
                                                    <VideoCard
                                                        key={video.id}
                                                        video={video}
                                                        isSelected={selectedVideoIds.has(video.id)}
                                                        onSelect={() => toggleSelection(video.id)}
                                                        onClick={() => handleVideoSelect(video)}
                                                    />
                                                )}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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
                        />
                    )}
                </main>
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