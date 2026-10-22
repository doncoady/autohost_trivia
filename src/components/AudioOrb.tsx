import React from 'react';

interface AudioOrbProps {
  status: 'idle' | 'host_speaking' | 'listening' | 'processing';
  isLive: boolean;
  onToggleMic?: () => void;
  micEnabled: boolean;
}

export const AudioOrb: React.FC<AudioOrbProps> = ({
  status,
  isLive,
  onToggleMic,
  micEnabled,
}) => {
  return (
    <div className="relative flex flex-col items-center justify-center my-6 select-none">
      {/* Background radial glow */}
      <div
        className={`absolute w-72 h-72 rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
          !isLive
            ? 'bg-slate-800/30'
            : status === 'host_speaking'
            ? 'bg-amber-500/25 scale-125'
            : status === 'listening'
            ? 'bg-emerald-500/30 scale-110'
            : 'bg-indigo-500/20'
        }`}
      />

      {/* Outer Pulse Rings */}
      {isLive && status === 'host_speaking' && (
        <>
          <div className="absolute w-56 h-56 rounded-full border border-amber-400/40 animate-ping opacity-30 pointer-events-none" />
          <div className="absolute w-64 h-64 rounded-full border border-yellow-300/20 animate-pulse pointer-events-none" />
        </>
      )}

      {isLive && status === 'listening' && (
        <>
          <div className="absolute w-56 h-56 rounded-full border border-emerald-400/40 animate-ping opacity-30 pointer-events-none" />
          <div className="absolute w-64 h-64 rounded-full border border-emerald-300/20 animate-pulse pointer-events-none" />
        </>
      )}

      {/* Main Sonic Orb */}
      <button
        type="button"
        onClick={onToggleMic}
        aria-label={
          !isLive
            ? 'Start Game Show Audio'
            : micEnabled
            ? 'Mute Microphone'
            : 'Unmute Microphone'
        }
        className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-500 cursor-pointer shadow-2xl focus:outline-none focus:ring-4 focus:ring-amber-400/50 ${
          !isLive
            ? 'bg-gradient-to-br from-slate-800 to-slate-950 border-2 border-slate-700 hover:border-slate-500'
            : status === 'host_speaking'
            ? 'bg-gradient-to-tr from-amber-600 via-yellow-500 to-orange-500 border-4 border-yellow-300 shadow-amber-500/50 scale-105'
            : status === 'listening'
            ? 'bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 border-4 border-emerald-300 shadow-emerald-500/50 scale-105'
            : 'bg-gradient-to-tr from-indigo-700 via-purple-600 to-slate-900 border-2 border-indigo-400'
        }`}
      >
        {/* Animated Inner Visualizer Waves */}
        <div className="flex items-center gap-1.5 h-12 mb-1">
          {[40, 75, 100, 60, 90, 45, 80, 50, 95, 65].map((baseHeight, idx) => {
            const isSpeaking = isLive && (status === 'host_speaking' || status === 'listening');
            return (
              <span
                key={idx}
                className={`w-1.5 rounded-full transition-all duration-150 ${
                  !isLive
                    ? 'h-3 bg-slate-600'
                    : status === 'host_speaking'
                    ? 'bg-white'
                    : status === 'listening'
                    ? 'bg-emerald-100'
                    : 'bg-indigo-300'
                }`}
                style={{
                  height: isSpeaking
                    ? `${Math.max(8, (baseHeight * (0.4 + 0.6 * Math.sin((idx + Date.now() / 200))))) % 44 + 8}px`
                    : '6px',
                  animation: isSpeaking ? `pulse 1.2s ease-in-out infinite ${idx * 0.1}s` : 'none',
                }}
              />
            );
          })}
        </div>

        {/* State Label */}
        <span className="text-xs uppercase font-extrabold tracking-widest text-white/90 drop-shadow">
          {!isLive
            ? 'Connect Host'
            : status === 'host_speaking'
            ? 'Host Speaking'
            : status === 'listening'
            ? (micEnabled ? 'Listening...' : 'Mic Muted')
            : 'Thinking...'}
        </span>

        {isLive && (
          <span className="text-[10px] text-white/70 mt-0.5">
            {micEnabled ? 'Tap to Mute' : 'Tap to Speak'}
          </span>
        )}
      </button>

      {/* Voice Activity Subtitle */}
      <div className="mt-4 flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            !isLive
              ? 'bg-slate-600'
              : status === 'host_speaking'
              ? 'bg-amber-400 animate-pulse'
              : status === 'listening'
              ? 'bg-emerald-400 animate-ping'
              : 'bg-indigo-400'
          }`}
        />
        <span className="text-sm font-medium text-slate-300">
          {!isLive
            ? 'Audio Standby — Click orb or "Start Show"'
            : status === 'host_speaking'
            ? 'Autohost voice is live on air'
            : status === 'listening'
            ? (micEnabled ? 'Your microphone is live — speak naturally' : 'Microphone muted — tap orb to unmute')
            : 'Synchronizing authoritative state...'}
        </span>
      </div>
    </div>
  );
};
