import React from 'react';
import { XIcon } from './Icons';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: { hideHiddenFiles: boolean };
    onToggleSetting: (key: string, value: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onToggleSetting }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative w-full max-w-md bg-[#1a1b26] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h2 className="text-lg font-bold text-white">Settings</h2>
                    <button onClick={onClose} className="text-glass-subtext hover:text-white transition-colors">
                        <XIcon />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-6">
                    {/* Setting Item */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-medium text-white">Hide Hidden Files</h3>
                            <p className="text-xs text-glass-subtext mt-1">Hides hidden files. Requires quick rescan.</p>
                        </div>
                        
                        {/* Toggle Switch */}
                        <button 
                            onClick={() => onToggleSetting('hideHiddenFiles', !settings.hideHiddenFiles)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${settings.hideHiddenFiles ? 'bg-brand-primary' : 'bg-white/10'}`}
                        >
                            <span 
                                className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow transition-transform duration-200 ease-in-out ${settings.hideHiddenFiles ? 'translate-x-6' : 'translate-x-0'}`}
                            />
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 bg-black/20 text-center">
                    <p className="text-[10px] text-glass-subtext">Play21 v1.0.0</p>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;