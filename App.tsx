import React, { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VideoCard from './components/VideoCard';
import VideoPlayer from './components/VideoPlayer';
import { XIcon, PlaylistPlusIcon, SortIcon, ChevronDownIcon } from './components/Icons';
import { processFiles } from './services/fileService';
import { getMockData } from './services/mockData';
import { VideoFile, FolderStructure, ViewState, Playlist, SortOption } from './types';
import { VirtuosoGrid } from 'react-virtuoso';

const App = () => {
    const [viewState, setViewState] = useState<ViewState>(ViewState.HOME);
    const [allVideos, setAllVideos] = useState<VideoFile[]>([]);
    const [folderStructure, setFolderStructure] = useState<FolderStructure>({});
    const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [sortOption, setSortOption] = useState<SortOption>(SortOption.DATE_NEWEST);
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, hasMore: true, isLoading: false });

    // Features State
    const [history, setHistory] = useState<string[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);

    // Selection State
    const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
    const [showBulkPlaylistMenu, setShowBulkPlaylistMenu] = useState(false);

    // ----------------------------------------------------------------
    // DATABASE CONNECTION CODE
    // ----------------------------------------------------------------

    const fetchVideos = async (page = 1, folder: string | null = null, reset = false) => {
        // Prevent duplicate loads
        if (!reset && (pagination.isLoading || !pagination.hasMore)) return;

        setPagination(prev => ({ ...prev, isLoading: true }));

        try {
            const url = new URL('/api/videos', window.location.origin);
            url.searchParams.set('page', page.toString());
            url.searchParams.set('limit', '50');
            if (folder) url.searchParams.set('folder', folder);

            const response = await fetch(url.toString());
            const data = await response.json();

            // Process subtitles (safe parsing)
            const newVideos = data.videos.map((v: any) => {
                let parsedSubtitles = [];
                try {
                    if (v.subtitles && typeof v.subtitles === 'string') parsedSubtitles = JSON.parse(v.subtitles);
                } catch (e) {}
                return { ...v, url: v.path, subtitles: parsedSubtitles };
            });

            if (reset) {
                setAllVideos(newVideos);
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
    useEffect(() => {
        fetchVideos(1, null, true);
    }, []);

    // 2. When Folder Changes (Reset and Fetch)
    useEffect(() => {
        // Only fetch if we are in HOME view (avoid fetching when watching video)
        if (viewState === ViewState.HOME) {
            setAllVideos([]); 
            fetchVideos(1, selectedFolder, true);
        }
    }, [selectedFolder]);

    // ... existing useEffect for fetchLocalVideos ...

    // --- NEW: HANDLE BROWSER BACK BUTTON ---
    useEffect(() => {
        // 1. Set initial state so we have a base to go back to
        window.history.replaceState({ view: ViewState.HOME, folder: null, videoId: null }, '');

        const onPopState = (event: PopStateEvent) => {
            if (event.state) {
                // Restore View & Folder
                setViewState(event.state.view || ViewState.HOME);
                setSelectedFolder(event.state.folder || null);
                setSelectedPlaylistId(event.state.playlistId || null);
                
                // Restore Video (if any)
                if (event.state.videoId) {
                    const vid = allVideos.find(v => v.id === event.state.videoId);
                    if (vid) {
                        setCurrentVideo(vid);
                        setIsSidebarOpen(false); // Optional: close sidebar for cinema mode
                    }
                } else {
                    setCurrentVideo(null);
                    // Re-open sidebar if we just exited a video
                    if (window.innerWidth >= 768) setIsSidebarOpen(true);
                }
            } else {
                // Fallback to Home if state is empty
                setViewState(ViewState.HOME);
                setSelectedFolder(null);
                setCurrentVideo(null);
            }
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [allVideos]);

    const handleScanLibrary = async () => {
        setIsScanning(true);
        try {
            // 1. Tell server to scan
            await fetch('/api/scan', { method: 'POST' });

            // 2. Fetch the updated list
            await fetchLocalVideos();
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
    const { displayedVideos, subFolders, canGoUp } = useMemo(() => {
        let videos = allVideos;
        let foundFolders: string[] = [];
        let showGoUp = false;

        // 1. Filter by View State (Favorites, History, etc)
        if (viewState === ViewState.FAVORITES) {
            videos = videos.filter(v => v.isFavorite);
        } else if (viewState === ViewState.HISTORY) {
            const historyVideos = history.map(id => allVideos.find(v => v.id === id)).filter(Boolean) as VideoFile[];
            videos = [...historyVideos].reverse();
        } else if (viewState === ViewState.PLAYLIST && selectedPlaylistId) {
            const playlist = playlists.find(p => p.id === selectedPlaylistId);
            videos = playlist ? playlist.videoIds.map(id => allVideos.find(v => v.id === id)).filter(Boolean) as VideoFile[] : [];
        } 
        
        // 2. FOLDER NAVIGATION LOGIC (Only active on Home view)
        else if (selectedFolder) {
            // Logic: Show ALL videos in this folder AND its subfolders (Recursive)
            // But also calculate which subfolders exist so we can show navigation buttons
            
            showGoUp = selectedFolder.includes('/'); 
            
            const folderSet = new Set<string>();

            // Filter videos to only those in this tree
            videos = videos.filter(v => {
                const isExactMatch = v.folder === selectedFolder;
                const isSubFolder = v.folder.startsWith(selectedFolder + '/'); // Ensure "Use" doesn't match "User"

                if (isExactMatch || isSubFolder) {
                    // It belongs in this view! 
                    
                    // If it is a subfolder, let's grab the folder name for the UI buttons
                    if (isSubFolder) {
                        const remainder = v.folder.substring(selectedFolder.length + 1);
                        const nextSegment = remainder.split('/')[0];
                        if (nextSegment) folderSet.add(nextSegment);
                    }
                    return true;
                }
                return false;
            });

            foundFolders = Array.from(folderSet).sort();
        }

        // 3. Search Filter (Global or Contextual)
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            videos = videos.filter(v => v.name.toLowerCase().includes(lower));
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
                default: return 0;
            }
        });

        return { displayedVideos: sortedVideos, subFolders: foundFolders, canGoUp: showGoUp };
    }, [allVideos, selectedFolder, searchTerm, viewState, history, playlists, selectedPlaylistId, sortOption]);

    // --- NEW NAVIGATION HANDLERS ---
    
    const handleEnterFolder = (subFolderName: string) => {
        const newPath = `${selectedFolder}/${subFolderName}`;
        
        // PUSH HISTORY
        window.history.pushState({ view: ViewState.HOME, folder: newPath }, '');
        
        setSelectedFolder(newPath);
    };

    const handleGoUp = () => {
        if (!selectedFolder) return;
        const parent = selectedFolder.split('/').slice(0, -1).join('/');
        const newFolder = parent || null; // If empty string, make it null (Root)

        // PUSH HISTORY
        window.history.pushState({ view: ViewState.HOME, folder: newFolder }, '');

        setSelectedFolder(newFolder);
    };

    const handleVideoSelect = (video: VideoFile) => {
        setHistory(prev => {
            const newHistory = prev.filter(id => id !== video.id);
            return [...newHistory, video.id];
        });

        // PUSH HISTORY
        window.history.pushState({ view: ViewState.WATCH, videoId: video.id }, '');

        setCurrentVideo(video);
        setViewState(ViewState.WATCH);
        setIsSidebarOpen(false);
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

    const handleBulkAddToPlaylist = (playlistId: string) => {
        setPlaylists(prev => prev.map(p => {
            if (p.id === playlistId) {
                const newIds = new Set([...p.videoIds, ...Array.from(selectedVideoIds)]);
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

    const handleCreatePlaylist = () => {
        const name = window.prompt("Enter Playlist Name:");
        if (name) {
            const newPlaylist: Playlist = {
                id: `pl-${Date.now()}`,
                name,
                videoIds: []
            };
            setPlaylists([...playlists, newPlaylist]);
        }
    };

    const handleAddToPlaylist = (videoId: string, playlistId: string) => {
        setPlaylists(prev => prev.map(p => {
            if (p.id === playlistId && !p.videoIds.includes(videoId)) {
                return { ...p, videoIds: [...p.videoIds, videoId] };
            }
            return p;
        }));
    };

    const handleGoHome = () => {
        // PUSH HISTORY
        window.history.pushState({ view: ViewState.HOME, folder: null }, '');

        setViewState(ViewState.HOME);
        setCurrentVideo(null);
        setSelectedFolder(null);
    };

    const relatedVideos = useMemo(() => {
        if (!currentVideo) return [];

        const sameFolder = allVideos.filter(v => v.folder === currentVideo.folder && v.id !== currentVideo.id);
        const others = allVideos.filter(v => v.folder !== currentVideo.folder && v.id !== currentVideo.id);
        return [...sameFolder, ...others].slice(0, 10);
    }, [currentVideo, allVideos]);

    // --- SIDEBAR WRAPPERS ---
    const handleSidebarViewChange = (newView: ViewState) => {
        window.history.pushState({ view: newView }, '');
        setViewState(newView);
        if (newView === ViewState.HOME) setSelectedFolder(null);
    };

    const handleSidebarFolderSelect = (folder: string | null) => {
        window.history.pushState({ view: ViewState.HOME, folder: folder }, '');
        setViewState(ViewState.HOME);
        setSelectedFolder(folder);
    };

    const handleSidebarPlaylistSelect = (id: string) => {
        window.history.pushState({ view: ViewState.PLAYLIST, playlistId: id }, '');
        setViewState(ViewState.PLAYLIST);
        setSelectedPlaylistId(id);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    return (
        <div className="h-screen w-full text-glass-text font-sans selection:bg-brand-primary selection:text-white overflow-hidden">
            <Header
                onTriggerScan={handleScanLibrary} // Pass the new function
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                goHome={handleGoHome}
                isScanning={isScanning} // Pass the loading state
            />

            <div className="pt-16 h-full flex relative">
                <Sidebar
                    isOpen={isSidebarOpen}
                    folders={folderStructure}
                    playlists={playlists}
                    viewState={viewState}
                    selectedFolder={selectedFolder}
                    selectedPlaylistId={selectedPlaylistId}
                    
                    // UPDATED HANDLERS
                    onSelectFolder={handleSidebarFolderSelect}
                    onSelectView={handleSidebarViewChange}
                    onSelectPlaylist={handleSidebarPlaylistSelect}
                    
                    onCreatePlaylist={handleCreatePlaylist}
                    onClose={() => setIsSidebarOpen(false)}
                />

                <main className={`flex-1 h-full overflow-y-auto transition-all duration-300 ${viewState !== ViewState.WATCH && isSidebarOpen ? 'md:ml-64' : ''}`}>

                    {allVideos.length === 0 && (
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
                        <div className="p-6 md:p-8 animate-fade-in relative min-h-full">
                            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
                                <div className="flex items-baseline gap-3">
                                    <h2 className="text-2xl font-bold text-white capitalize">
                                        {viewState === ViewState.HOME ? (selectedFolder || 'All Videos') :
                                            viewState === ViewState.PLAYLIST ? playlists.find(p => p.id === selectedPlaylistId)?.name :
                                                viewState.toLowerCase()}
                                    </h2>
                                    <span className="text-sm text-glass-subtext">{displayedVideos.length} videos</span>
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

                            {/* --- FOLDER GRID --- */}
                            {/* --- FOLDER GRID (Compact) --- */}
                            {subFolders.length > 0 && (
                                <div className="mb-8">
                                    <div className="flex items-center gap-2 mb-3">
                                        <h3 className="text-[10px] font-bold text-glass-subtext uppercase tracking-widest">Subfolders</h3>
                                        <div className="h-px bg-white/5 flex-1"></div>
                                    </div>
                                    
                                    {/* Updated Grid: More columns, smaller gap */}
                                    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                        {subFolders.map(folder => (
                                            <div 
                                                key={folder}
                                                onClick={() => handleEnterFolder(folder)}
                                                className="group relative aspect-[4/3] bg-white/5 hover:bg-white/10 border border-white/5 hover:border-brand-primary/50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden"
                                            >
                                                {/* Smaller Folder Icon */}
                                                <div className="mb-1.5 text-brand-primary opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all">
                                                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                                                </div>
                                                
                                                {/* Smaller Text */}
                                                <span className="text-xs font-medium text-white/70 group-hover:text-white truncate max-w-[90%] px-1 text-center">
                                                    {folder}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* --- VIRTUALIZED VIDEO GRID --- */}
                            {displayedVideos.length > 0 && (
                                <div style={{ height: 'calc(100vh - 200px)', width: '100%' }}>
                                    <VirtuosoGrid
                                        style={{ height: '100%' }}
                                        data={displayedVideos}
                                        endReached={() => fetchVideos(pagination.page, selectedFolder)}
                                        overscan={200}
                                        components={{
                                            List: React.forwardRef(({ style, children, ...props }: any, ref) => (
                                                <div
                                                    ref={ref}
                                                    {...props}
                                                    style={style}
                                                    className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-y-10 gap-x-6 pb-20 pr-4"
                                                >
                                                    {children}
                                                </div>
                                            ))
                                        }}
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

                            {displayedVideos.length === 0 && (
                                <div className="col-span-full py-20 text-center">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-glass-subtext">
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                    </div>
                                    <p className="text-xl font-medium text-glass-subtext">No videos found here.</p>
                                    {viewState === ViewState.FAVORITES && <p className="text-sm text-glass-subtext/60 mt-2">Mark videos with the star icon to see them here.</p>}
                                </div>
                            )}

                            {selectedVideoIds.size > 0 && (
                                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 glass-panel px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 z-50 animate-fade-in border border-brand-primary/20">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-brand-primary/20 text-brand-primary font-bold px-3 py-1 rounded-lg text-sm">
                                            {selectedVideoIds.size} Selected
                                        </div>
                                        <button onClick={clearSelection} className="p-1 hover:bg-white/10 rounded-full transition-colors text-glass-subtext hover:text-white">
                                            <XIcon />
                                        </button>
                                    </div>

                                    <div className="h-8 w-px bg-white/10"></div>

                                    <div className="relative">
                                        <button
                                            onClick={() => setShowBulkPlaylistMenu(!showBulkPlaylistMenu)}
                                            className="flex items-center gap-2 bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-brand-primary/20"
                                        >
                                            <PlaylistPlusIcon />
                                            <span>Add to Playlist</span>
                                        </button>
                                        {showBulkPlaylistMenu && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 glass-panel rounded-xl shadow-xl py-2 overflow-hidden">
                                                <div className="px-4 py-2 text-xs font-bold text-glass-subtext uppercase">Select Playlist</div>
                                                {playlists.length === 0 && <div className="px-4 py-3 text-sm italic opacity-50 text-center">No playlists created</div>}
                                                {playlists.map(p => (
                                                    <div
                                                        key={p.id}
                                                        onClick={() => handleBulkAddToPlaylist(p.id)}
                                                        className="px-4 py-3 hover:bg-white/10 cursor-pointer text-sm font-medium transition-colors flex items-center justify-between"
                                                    >
                                                        <span className="truncate">{p.name}</span>
                                                        <span className="text-xs text-glass-subtext bg-white/5 px-1.5 py-0.5 rounded">{p.videoIds.length}</span>
                                                    </div>
                                                ))}
                                                <div className="border-t border-white/5 mt-1 pt-1">
                                                    <div
                                                        onClick={() => { handleCreatePlaylist(); setShowBulkPlaylistMenu(false); }}
                                                        className="px-4 py-3 hover:bg-white/10 cursor-pointer text-sm text-brand-secondary font-bold flex items-center gap-2"
                                                    >
                                                        <span className="text-lg">+</span> Create New
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
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

export default App;