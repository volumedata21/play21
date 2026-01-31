import React from 'react';
import { MenuIcon, SearchIcon, UploadIcon } from './Icons';

interface HeaderProps {
  onTriggerScan: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  toggleSidebar: () => void;
  goHome: () => void;
  isScanning?: boolean;
  isAutoplayOn: boolean;
  onToggleAutoplay: () => void;
}

const Header: React.FC<HeaderProps> = ({
  onTriggerScan,
  searchTerm,
  onSearchChange,
  toggleSidebar,
  goHome,
  isScanning = false,
  isAutoplayOn,      // <--- ADD THIS
  onToggleAutoplay   // <--- ADD THIS
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-panel border-b-0 border-b-white/5 flex items-center justify-between px-6 z-50">
      <div className="flex items-center gap-6">
        <button
          onClick={toggleSidebar}
          className="p-2 text-glass-subtext hover:text-white transition-colors rounded-full hover:bg-white/5"
        >
          <MenuIcon />
        </button>

        <div onClick={goHome} className="flex items-center gap-2 cursor-pointer group">
          <div className="relative w-9 h-9 flex items-center justify-center">
            {/* The Animated Glow Effect */}
            <div className="absolute inset-0 bg-brand-primary rounded-full blur-md opacity-70 group-hover:opacity-100 group-hover:scale-115 animate-pulse transition-all duration-700 shadow-[0_0_20px_5px_rgba(37,99,235,0.6)]"></div>

            {/* Your Logo */}
            <img
              src="/logo.png"
              alt="Play21 Logo"
              className="relative z-10 w-full h-full object-contain"
            />
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

      <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-glass-subtext">Autoplay</span>
        <button
          onClick={onToggleAutoplay}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isAutoplayOn ? 'bg-brand-primary' : 'bg-white/10'}`}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isAutoplayOn ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={onTriggerScan}
          disabled={isScanning}
          className={`flex items-center gap-2 glass-button px-4 py-2 rounded-xl text-sm font-medium transition-all ${isScanning ? 'opacity-50 cursor-wait' : 'text-white/90 hover:bg-white/10'}`}
          title="Scan Media Folder"
        >
          <UploadIcon />
          <span className="hidden sm:inline">
            {isScanning ? 'Scanning...' : 'Scan Library'}
          </span>
        </button>
      </div>
    </header>
  );
};

export default Header;