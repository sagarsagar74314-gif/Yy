import React from 'react';
import { Mic, MicOff, ShieldCheck, ShieldAlert } from 'lucide-react';

interface FloatingMicOrbProps {
  isActive: boolean;
  isSpeaking: boolean;
  autoHideWhenIdle: boolean;
  audioLevel: number;
  voiceMatchStatus: 'idle' | 'verified' | 'rejected';
  onToggle: () => void;
}

export const FloatingMicOrb: React.FC<FloatingMicOrbProps> = ({
  isActive,
  isSpeaking,
  autoHideWhenIdle,
  audioLevel,
  voiceMatchStatus,
  onToggle,
}) => {
  // User requirement: "baat karun to Mike ka Gola icon dikhe, main baat nahin karun to dikhe nahin"
  // When autoHideWhenIdle is true and neither mic is active nor AI is speaking, hide the large orb
  const shouldHideOrb = autoHideWhenIdle && !isActive && !isSpeaking;

  if (shouldHideOrb) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Tap or speak to summon Aanya Mic Orb"
        className="fixed bottom-5 right-5 z-40 w-11 h-11 rounded-full bg-[#161B26]/90 border border-white/15 text-slate-300 hover:text-white hover:border-rose-400/50 flex items-center justify-center shadow-lg transition-all duration-200 cursor-pointer"
        aria-label="Wake microphone orb"
      >
        <Mic className="w-4 h-4" />
      </button>
    );
  }

  const ringScale = 1 + Math.min(0.42, audioLevel * 1.9);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {isActive && voiceMatchStatus !== 'idle' && (
        <div
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border shadow-lg ${
            voiceMatchStatus === 'verified'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-amber-950/90 border-amber-500/40 text-amber-200'
          }`}
        >
          {voiceMatchStatus === 'verified' ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sagar Verified</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Background Voice Filtered</span>
            </>
          )}
        </div>
      )}

      <div className="relative flex items-center justify-center">
        <div
          className={`absolute inset-0 rounded-full transition-transform duration-150 pointer-events-none ${
            isActive
              ? 'bg-rose-500/25 border border-rose-400/40'
              : isSpeaking
                ? 'bg-indigo-500/25 border border-indigo-400/40'
                : 'bg-transparent'
          }`}
          style={{ transform: `scale(${ringScale})` }}
        />

        <button
          type="button"
          onClick={onToggle}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-xl border transition-all duration-200 cursor-pointer ${
            isActive
              ? 'bg-rose-600 hover:bg-rose-500 border-rose-300/60 text-white'
              : isSpeaking
                ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-300/60 text-white'
                : 'bg-[#1A2030] hover:bg-[#232A3E] border-white/15 text-slate-200'
          }`}
          aria-label={isActive ? 'Stop voice conversation' : 'Start voice conversation'}
        >
          {isActive ? <Mic className="w-6 h-6" /> : <MicOff className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};
