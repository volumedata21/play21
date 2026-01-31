import React, { useState, useRef, useEffect } from 'react';
import { MenuIcon, SearchIcon, ScanIcon, ArrowLeftIcon, XIcon } from './Icons';

interface HeaderProps {
  onTriggerScan: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  toggleSidebar: () => void;
  goHome: () => void;
  isScanning?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  onTriggerScan,
  searchTerm,
  onSearchChange,
  toggleSidebar,
  goHome,
  isScanning = false
}) => {
  // This manages opening/closing the search bar on mobile
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  
  // This lets us auto-focus the typing area when you click search
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMobileSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMobileSearchOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-panel border-b-0 border-b-white/5 flex items-center justify-between px-4 md:px-6 z-50 transition-all duration-300">
      
      {/* --- MOBILE SEARCH MODE --- */}
      {/* If mobile search is OPEN, we show this full-width search bar */}
      {isMobileSearchOpen ? (
        <div className="flex w-full items-center gap-3 animate-fade-in">
          <button 
            onClick={() => setIsMobileSearchOpen(false)}
            className="p-2 -ml-2 text-glass-subtext hover:text-white"
          >
            <ArrowLeftIcon />
          </button>
          
          <div className="flex-1 relative">
             <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-white/10 border border-white/10 rounded-xl py-2 pl-4 pr-10 outline-none text-base text-white placeholder-white/30"
            />
            {searchTerm && (
              <button 
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white"
              >
                <XIcon />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* --- NORMAL HEADER MODE --- */
        /* If mobile search is CLOSED (or we are on desktop), we show the normal header */
        <>
          {/* LEFT: Menu Button & Logo */}
          <div className="flex items-center gap-3 md:gap-6">
            <button onClick={toggleSidebar} className="p-2 -ml-2 text-glass-subtext hover:text-white transition-colors rounded-full hover:bg-white/5">
              <MenuIcon />
            </button>

            <div onClick={goHome} className="flex items-center gap-2 cursor-pointer group">
              {/* Logo Glow Effect */}
              <div className="relative w-8 h-8 md:w-9 md:h-9 flex items-center justify-center">
                <div className="absolute inset-0 bg-brand-primary rounded-full blur-md opacity-70 group-hover:opacity-100 animate-pulse transition-all duration-700"></div>
                <img
                  src="/logo.png"
                  alt="Play21"
                  className="relative z-10 w-full h-full object-contain"
                />
              </div>
              <span className="text-lg md:text-xl font-bold tracking-tight text-white/90">Play21</span>
            </div>
          </div>

          {/* CENTER: Desktop Search Bar (Hidden on Mobile) */}
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
                className="w-full bg-black/20 border border-white/10 rounded-2xl py-2.5 pl-10 pr-10 outline-none text-sm text-glass-text placeholder-glass-subtext focus:border-brand-primary/50 focus:bg-black/40 transition-all focus:shadow-[0_0_15px_rgba(37,99,235,0.1)]"
              />
              {searchTerm && (
                 <button 
                    onClick={() => onSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                 >
                    <XIcon />
                 </button>
              )}
            </div>
          </div>

          {/* RIGHT: Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            
            {/* Mobile Search Button (Visible only on mobile) */}
            <button 
              onClick={() => setIsMobileSearchOpen(true)}
              className="md:hidden p-2 text-glass-subtext hover:text-white rounded-full hover:bg-white/10"
            >
              <SearchIcon />
            </button>

            {/* New Scan Button */}
            <button
              onClick={onTriggerScan}
              disabled={isScanning}
              className={`flex items-center gap-2 glass-button px-3 md:px-4 py-2 rounded-xl text-sm font-medium transition-all ${isScanning ? 'opacity-50 cursor-wait' : 'text-white/90 hover:bg-white/10'}`}
              title="Scan Media Folder"
            >
              <div className={isScanning ? 'animate-spin' : ''}>
                 <ScanIcon />
              </div>
              {/* Text hidden on mobile, visible on desktop */}
              <span className="hidden md:inline">
                {isScanning ? 'Scanning...' : 'Scan'}
              </span>
            </button>
          </div>
        </>
      )}
    </header>
  );
};

export default Header;