import React, { useRef, useState } from 'react';
import { MenuIcon, SearchIcon, UploadIcon } from './Icons';

interface HeaderProps {
  onFilesSelected: (files: FileList) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  toggleSidebar: () => void;
  goHome: () => void;
}

const Header: React.FC<HeaderProps> = ({ onFilesSelected, searchTerm, onSearchChange, toggleSidebar, goHome }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);

  const handleFolderClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to log out?")) {
      window.location.reload();
    }
  };

  const handleChangePassword = () => {
    const pass = prompt("Enter new password:");
    if (pass) alert("Password updated successfully!");
  };

  const handleChangeAvatar = () => {
    const url = prompt("Enter avatar image URL:");
    if (url) setAvatar(url);
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-panel border-b-0 border-b-white/5 flex items-center justify-between px-6 z-50">
      <div className="flex items-center gap-6">
        <button onClick={toggleSidebar} className="p-2 text-glass-subtext hover:text-white transition-colors rounded-full hover:bg-white/5">
          <MenuIcon />
        </button>
        <div onClick={goHome} className="flex items-center gap-2 cursor-pointer group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-accent flex items-center justify-center shadow-lg shadow-brand-primary/20 group-hover:shadow-brand-primary/40 transition-shadow">
            <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white/90">Play21</span>
        </div>
      </div>

      <div className="hidden md:flex flex-1 max-w-[500px] mx-8">
        <div className="relative w-full group">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-white/30 group-focus-within:text-brand-primary transition-colors">
            <SearchIcon />
          </div>
          <input
            type="text"
            placeholder="Search your library..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-2xl py-2.5 pl-10 pr-4 outline-none text-sm text-glass-text placeholder-glass-subtext focus:border-brand-primary/50 focus:bg-black/40 transition-all focus:shadow-[0_0_15px_rgba(37,99,235,0.1)]"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          // @ts-ignore
          webkitdirectory="" 
          directory=""
          multiple
          onChange={(e) => e.target.files && onFilesSelected(e.target.files)}
        />
        <button 
          onClick={handleFolderClick}
          className="flex items-center gap-2 glass-button px-4 py-2 rounded-xl text-sm font-medium text-white/90"
          title="Select Local Folder"
        >
          <UploadIcon />
          <span className="hidden sm:inline">Open Folder</span>
        </button>
        
        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-700 to-brand-dark border border-white/10 flex items-center justify-center text-xs font-bold shadow-lg overflow-hidden hover:ring-2 ring-brand-primary transition-all"
          >
            {avatar ? (
              <img src={avatar} className="w-full h-full object-cover" />
            ) : (
              "U"
            )}
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 glass-panel rounded-xl shadow-2xl py-2 z-50 border border-white/10 animate-fade-in">
                <div className="px-4 py-2 border-b border-white/5 mb-1">
                   <p className="text-xs font-bold text-glass-subtext uppercase">User Options</p>
                </div>
                <button onClick={handleChangeAvatar} className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-brand-primary/20 hover:text-white transition-colors">
                  Change Avatar
                </button>
                <button onClick={handleChangePassword} className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-brand-primary/20 hover:text-white transition-colors">
                  Change Password
                </button>
                <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;