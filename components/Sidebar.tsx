import React from 'react';
import { HomeIcon, FolderIcon, HistoryIcon, StarIcon, PlaylistPlusIcon, PlaylistIcon, SettingsIcon } from './Icons';
import { FolderStructure, ViewState, Playlist } from '../types';

interface SidebarProps {
  isOpen: boolean;
  folders: FolderStructure;
  playlists: Playlist[];
  viewState: ViewState;
  selectedFolder: string | null;
  selectedPlaylistId: string | null;
  onSelectFolder: (folder: string | null) => void;
  onSelectView: (view: ViewState) => void;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  folders,
  playlists,
  viewState,
  selectedFolder,
  selectedPlaylistId,
  onSelectFolder,
  onSelectView,
  onSelectPlaylist,
  onCreatePlaylist,
  onOpenSettings,
  onClose
}) => {
  // In Watch view, the sidebar should act as a floating overlay
  const isWatchMode = viewState === ViewState.WATCH;

  return (
    <>
      {/* Overlay backdrop for mobile or Watch mode */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[55] transition-opacity duration-300 ${isOpen && (isWatchMode || window.innerWidth < 768) ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`fixed left-0 top-16 w-64 h-[calc(100vh-4rem)] glass-panel border-r border-white/5 overflow-y-auto flex flex-col transition-transform duration-300 ease-in-out z-[60] 
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        ${isWatchMode ? 'shadow-2xl' : ''}`}>

        <div className="p-4 flex flex-col gap-1">
          {/* Main Nav */}
          <div
            onClick={() => { onSelectView(ViewState.HOME); onSelectFolder(null); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-100 outline-none focus:outline-none focus:ring-0 tap-highlight-transparent group ${viewState === ViewState.HOME && selectedFolder === null
                ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/10 border border-white/5 text-white shadow-lg shadow-brand-primary/5'
                : 'text-glass-subtext hover:bg-white/5 hover:text-white'
              }`}
          >
            <div className={`${viewState === ViewState.HOME && selectedFolder === null ? 'text-brand-primary' : 'group-hover:text-white'}`}>
              <HomeIcon />
            </div>
            <span className="text-sm font-medium tracking-wide">Home</span>
          </div>

          <div
            onClick={() => onSelectView(ViewState.HISTORY)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-100 outline-none focus:outline-none focus:ring-0 tap-highlight-transparent group ${viewState === ViewState.HISTORY
                ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/10 border border-white/5 text-white shadow-lg shadow-brand-primary/5'
                : 'text-glass-subtext hover:bg-white/5 hover:text-white'
              }`}
          >
            <div className={`${viewState === ViewState.HISTORY ? 'text-brand-accent' : 'group-hover:text-white'}`}>
              <HistoryIcon />
            </div>
            <span className="text-sm font-medium tracking-wide">History</span>
          </div>

          <div
            onClick={() => onSelectView(ViewState.FAVORITES)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-100 outline-none focus:outline-none focus:ring-0 tap-highlight-transparent group ${viewState === ViewState.FAVORITES
                ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/10 border border-white/5 text-white shadow-lg shadow-brand-primary/5'
                : 'text-glass-subtext hover:bg-white/5 hover:text-white'
              }`}
          >
            <div className={`${viewState === ViewState.FAVORITES ? 'text-yellow-400' : 'group-hover:text-white'}`}>
              <StarIcon />
            </div>
            <span className="text-sm font-medium tracking-wide">Favorites</span>
          </div>

          {/* NEW: Watch Later Shortcut */}
          <div
            onClick={() => {
              const wl = playlists.find(p => p.name === 'Watch Later');
              if (wl) onSelectPlaylist(wl.id);
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-100 outline-none focus:outline-none focus:ring-0 tap-highlight-transparent group ${selectedPlaylistId === playlists.find(p => p.name === 'Watch Later')?.id
                ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/10 border border-white/5 text-white shadow-lg shadow-brand-primary/5'
                : 'text-glass-subtext hover:bg-white/5 hover:text-white'
              }`}
          >
            <div className="opacity-70 group-hover:opacity-100 group-hover:text-brand-primary">
              <HistoryIcon />
            </div>
            <span className="text-sm font-medium tracking-wide">Watch Later</span>
          </div>

          {/* Playlists */}
          <div className="mt-6 mb-2 px-4 flex items-center justify-between">
            <h3 className="text-xs font-bold text-glass-subtext uppercase tracking-widest">Playlists</h3>
            <button onClick={onCreatePlaylist} className="text-glass-subtext hover:text-brand-accent transition-colors" title="Create Playlist">
              <PlaylistPlusIcon />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {playlists.length === 0 && (
              <div className="px-4 py-2 text-sm text-glass-subtext italic opacity-50">No playlists</div>
            )}
            {/* FIX: Filter out Watch Later so it doesn't show up twice */}
            {playlists
              .filter(p => p.name !== 'Watch Later')
              .map(playlist => (
                <div
                  key={playlist.id}
                  onClick={() => onSelectPlaylist(playlist.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-100 outline-none focus:outline-none focus:ring-0 tap-highlight-transparent truncate group ${viewState === ViewState.PLAYLIST && selectedPlaylistId === playlist.id
                    ? 'bg-white/10 text-white border border-white/5 shadow-inner'
                    : 'text-glass-subtext hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <div className={`${viewState === ViewState.PLAYLIST && selectedPlaylistId === playlist.id ? 'text-brand-primary' : 'opacity-70 group-hover:opacity-100'}`}>
                    <PlaylistIcon />
                  </div>
                  <span className="text-sm font-medium truncate">{playlist.name}</span>
                </div>
              ))}
          </div>

          {/* Folders */}
          <div className="mt-6 mb-2 px-4">
            <h3 className="text-xs font-bold text-glass-subtext uppercase tracking-widest">Local Folders</h3>
          </div>

          <div className="flex flex-col gap-1">
            {Object.keys(folders).length === 0 && (
              <div className="px-4 py-2 text-sm text-glass-subtext italic opacity-50">Empty</div>
            )}
            {Object.keys(folders).map((folder) => {
              const isSelected = viewState === ViewState.HOME && selectedFolder === folder;
              return (
                <div
                  key={folder}
                  onClick={() => { onSelectView(ViewState.HOME); onSelectFolder(folder); }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-100 outline-none focus:outline-none focus:ring-0 tap-highlight-transparent truncate group ${isSelected
                    ? 'bg-white/10 text-white border border-white/5 shadow-inner'
                    : 'text-glass-subtext hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <div className={`${isSelected ? 'text-brand-secondary' : 'opacity-70 group-hover:opacity-100'}`}>
                    <FolderIcon />
                  </div>
                  <span className="text-sm font-medium truncate">{folder}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-white/5 bg-black/20">
          {/* Settings Button */}
          <button 
            onClick={onOpenSettings}
            className="flex items-center gap-3 w-full text-glass-subtext hover:text-white transition-colors mb-6 group outline-none focus:outline-none focus:ring-0 tap-highlight-transparent"
          >
            <div className="group-hover:rotate-90 transition-transform duration-500">
              <SettingsIcon />
            </div>
            <span className="text-sm font-medium">Settings</span>
          </button>
          <p className="text-[10px] text-glass-subtext leading-relaxed">
            <span className="font-bold text-white/50">Play21</span> <br />
            Personal Library <br />
            &copy; 2025
          </p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;