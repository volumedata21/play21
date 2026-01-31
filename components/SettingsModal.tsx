import React from 'react';
import { XIcon } from './Icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hideHiddenFiles: boolean;
  setHideHiddenFiles: (val: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  hideHiddenFiles, 
  setHideHiddenFiles 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        onClick={onClose} 
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md glass-panel rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-fade-in-up bg-[#1a1a1a]">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-glass-subtext hover:text-white">
            <XIcon />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Hide Hidden Files</h3>
              <p className="text-xs text-glass-subtext">Filter out .files and .folders from your library</p>
            </div>
            <button 
              onClick={() => setHideHiddenFiles(!hideHiddenFiles)}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${hideHiddenFiles ? 'bg-brand-primary' : 'bg-white/10'}`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${hideHiddenFiles ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;