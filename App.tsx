import React, { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VideoCard from './components/VideoCard';
import VideoPlayer from './components/VideoPlayer';
import { XIcon, PlaylistPlusIcon, SortIcon, ChevronDownIcon } from './components/Icons';
import { processFiles } from './services/fileService';
import { getMockData } from './services/mockData';
import { VideoFile, FolderStructure, ViewState, Playlist, SortOption } from './types';

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

    // Features State
    const [history, setHistory] = useState<string[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);

    // Selection State
    const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
    const [showBulkPlaylistMenu, setShowBulkPlaylistMenu] = useState(false);

    // ----------------------------------------------------------------
    // DATABASE CONNECTION CODE
    // ----------------------------------------------------------------

    const fetchLocalVideos = async () => {
        try {
            const response = await fetch('/api/videos');

            if (!response.ok) {
                throw new Error('Failed to connect to backend');
            }

            const data = await response.json();

            const dbVideos = data.videos.map((v: any) => ({
                ...v,
                url: v.path,
                subtitles: v.subtitles || [] 
            }));

            const structure: FolderStructure = {};
            dbVideos.forEach((video: VideoFile) => {
                const folderName = video.folder || 'Local Library';
                if (!structure[folderName]) {
                    structure[folderName] = [];
                }
                structure[folderName].push(video);
            });

            setAllVideos(dbVideos);
            setFolderStructure(structure);

            if (dbVideos.length > 0) {
                setViewState(ViewState.HOME);
            }

        } catch (error) {
            console.log("Backend not connected yet (or empty). Waiting...", error);
        }
    };

    useEffect(() => {
        fetchLocalVideos();
    }, []);

    const handleScanLibrary = async () => {
        setIsScanning(true);
        try {
            await fetch('/api/scan', { method: 'POST' });
            await fetchLocalVideos();
        } catch (e) {
            console.error("Scan failed", e);
        } finally {
            setIsScanning(false);
        }
    };

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

    const displayedVideos = useMemo(() => {
        let videos = allVideos;

        if (viewState === ViewState.FAVORITES) {
            videos = videos.filter(v => v.isFavorite);
        } else if (viewState === ViewState.HISTORY) {
            const historyVideos = history.map(id => allVideos.find(v => v.id === id)).filter(Boolean) as VideoFile[];
            videos = [...historyVideos].reverse();
        } else if (viewState === ViewState.PLAYLIST && selectedPlaylistId) {
            const playlist = playlists.find(p => p.id === selectedPlaylistId);
            if (playlist) {
                videos = playlist.videoIds.map(id => allVideos.find(v => v.id === id)).filter(Boolean) as VideoFile[];
            } else {
                videos = [];
            }
        } else if (selectedFolder) {
            videos = videos.filter(v => v.folder === selectedFolder);
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            videos = videos.filter(v => v.name.toLowerCase().includes(lower));
        }

        const sortedVideos = [...videos].sort((a, b) => {
            switch (sortOption) {
                case SortOption.NAME_ASC:
                    return a.name.localeCompare(b.name);
                case SortOption.NAME_DESC:
                    return b.name.localeCompare(a.name);
                case SortOption.DATE_NEWEST:
                    return (b.createdAt || 0) - (a.createdAt || 0);
                case SortOption.DATE_OLDEST:
                    return (a.createdAt || 0) - (b.createdAt || 0);
                case SortOption.VIEWS_MOST:
                    return (b.viewsCount || 0) - (a.viewsCount || 0);
                case SortOption.VIEWS_LEAST:
                    return (a.viewsCount || 0) - (b.viewsCount || 0);
                case SortOption.DURATION_LONGEST:
                    return (b.duration || 0) - (a.duration || 0);
                case SortOption.DURATION_SHORTEST:
                    return (a.duration || 0) - (b.duration || 0);
                default:
                    return 0;
            }
        });

        return sortedVideos;
    }, [allVideos, selectedFolder, searchTerm, viewState, history, playlists, selectedPlaylistId, sortOption]);

    const handleVideoSelect = (video: VideoFile) => {
        setHistory(prev => {
            const newHistory = prev.filter(id => id !== video.id);
            return [...newHistory, video.id];
        });

        setCurrentVideo(video);
        setViewState(ViewState.WATCH);
        
        // 1. ALWAYS collapse sidebar when selecting a video for maximum immersion
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
                    onSelectFolder={setSelectedFolder}
                    onSelectView={setViewState}
                    onSelectPlaylist={(id) => { setViewState(ViewState.PLAYLIST); setSelectedPlaylistId(id); setIsSidebarOpen(window.innerWidth < 768 ? false : isSidebarOpen); }}
                    onCreatePlaylist={handleCreatePlaylist}
                    onClose={() => setIsSidebarOpen(false)}
                />
                
                {/* 2. THE LAYOUT FIX: Remove 'viewState !== ViewState.WATCH'. 
                    If sidebar is open, we apply margin. This creates the "Push" effect. */}
                <main className={`flex-1 h-full overflow-y-auto transition-all duration-300 ${isSidebarOpen ? 'md:ml-64' : ''}`}>

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

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-y-10 gap-x-6 pb-20">
                                {displayedVideos.map(video => (
                                    <VideoCard
                                        key={video.id}
                                        video={video}
                                        isSelected={selectedVideoIds.has(video.id)}
                                        onSelect={() => toggleSelection(video.id)}
                                        onClick={() => handleVideoSelect(video)}
                                    />
                                ))}
                            </div>

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