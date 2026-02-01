import React, { useState, useRef, useEffect } from 'react';
import { MenuIcon, SearchIcon, ScanIcon, ArrowLeftIcon, XIcon, ChevronDownIcon } from './Icons';

interface HeaderProps {
  onTriggerScan: (type?: 'quick' | 'full') => void; // UPDATED Signature
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
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isScanMenuOpen, setIsScanMenuOpen] = useState(false); // NEW STATE
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMobileSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMobileSearchOpen]);

  // Close menu if clicking outside (simple implementation)
  useEffect(() => {
    const closeMenu = () => setIsScanMenuOpen(false);
    if (isScanMenuOpen) window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [isScanMenuOpen]);

  const handleScanClick = (e: React.MouseEvent, type: 'quick' | 'full') => {
    e.stopPropagation(); // Prevent the window click listener from firing immediately
    onTriggerScan(type);
    setIsScanMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-panel border-b-0 border-b-white/5 flex items-center justify-between px-4 md:px-6 z-50 transition-all duration-300">
      
      {/* --- MOBILE SEARCH MODE --- */}
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
        <>
          {/* LEFT: Menu Button & Logo */}
          <div className="flex items-center gap-3 md:gap-6">
            <button onClick={toggleSidebar} className="p-2 -ml-2 text-glass-subtext hover:text-white transition-colors rounded-full hover:bg-white/5">
              <MenuIcon />
            </button>

            <div onClick={goHome} className="flex items-center gap-2 cursor-pointer group">
              <div className="relative w-8 h-8 md:w-9 md:h-9 flex items-center justify-center">
                <div className="absolute inset-0 bg-brand-primary rounded-full blur-md opacity-70 group-hover:opacity-100 animate-pulse transition-all duration-700"></div>
                <img src="/logo.png" alt="Play21" className="relative z-10 w-full h-full object-contain" />
              </div>
              <span className="text-lg md:text-xl font-bold tracking-tight text-white/90">Play21</span>
            </div>
          </div>

          {/* CENTER: Desktop Search Bar */}
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
                 <button onClick={() => onSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                    <XIcon />
                 </button>
              )}
            </div>
          </div>

          {/* RIGHT: Actions */}
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={() => setIsMobileSearchOpen(true)} className="md:hidden p-2 text-glass-subtext hover:text-white rounded-full hover:bg-white/10">
              <SearchIcon />
            </button>

            {/* --- NEW SPLIT SCAN BUTTON --- */}
            <div className="relative">
                <div className="flex items-center bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5">
                    {/* Primary Button: Quick Scan */}
                    <button
                        onClick={(e) => handleScanClick(e, 'quick')}
                        disabled={isScanning}
                        className={`flex items-center gap-2 px-3 py-2 rounded-l-xl text-sm font-medium border-r border-white/10 ${isScanning ? 'opacity-50 cursor-wait' : 'text-white/90 hover:text-white'}`}
                        title="Quick Scan (New files only)"
                    >
                        <div className={isScanning ? 'animate-spin' : ''}>
                            <ScanIcon />
                        </div>
                        <span className="hidden md:inline">
                            {isScanning ? 'Scanning...' : 'Scan'}
                        </span>
                    </button>

                    {/* Dropdown Trigger */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsScanMenuOpen(!isScanMenuOpen);
                        }}
                        disabled={isScanning}
                        className="px-1.5 py-2 rounded-r-xl text-glass-subtext hover:text-white hover:bg-white/5"
                    >
                        <ChevronDownIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Dropdown Menu */}
                {isScanMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-gradient-to-br from-gray-900 to-black/90 backdrop-blur-md rounded-xl shadow-2xl py-1 z-50 animate-fade-in border border-white/10">
                        <button
                            onClick={(e) => handleScanClick(e, 'quick')}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 text-white transition-colors"
                        >
                            Quick Scan
                            <span className="block text-[10px] text-glass-subtext mt-0.5">Find new files only</span>
                        </button>
                        <button
                            onClick={(e) => handleScanClick(e, 'full')}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 text-white transition-colors border-t border-white/5"
                        >
                            Deep Metadata Refresh
                            <span className="block text-[10px] text-glass-subtext mt-0.5">Re-read all NFOs & tags</span>
                        </button>
                    </div>
                )}
            </div>

          </div>
        </>
      )}
    </header>
  );
};

export default Header;