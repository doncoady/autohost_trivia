import React, { useState } from 'react';
import { Volume2, User, ChevronDown, ChevronUp } from 'lucide-react';

export interface TranscriptEntry {
  id: string;
  role: 'host' | 'player';
  text: string;
  timestamp: string;
}

interface SpokenCaptionsProps {
  transcripts: TranscriptEntry[];
  latestHostUtterance: string;
}

export const SpokenCaptions: React.FC<SpokenCaptionsProps> = ({
  transcripts,
  latestHostUtterance,
}) => {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-2">
      {/* Active Spoken Caption Box */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 mt-0.5">
          <Volume2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400 mb-0.5">
            Host Speech (Gemini Live Audio)
          </div>
          <p className="text-sm font-medium text-slate-200 leading-relaxed italic">
            "{latestHostUtterance || 'Welcome to Autohost Trivia! Press "Start Game Show" to begin.'}"
          </p>
        </div>
        {transcripts.length > 1 && (
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 p-1"
          >
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded Transcript Log */}
      {showHistory && (
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 max-h-48 overflow-y-auto space-y-2 text-xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Audio Dialogue Log
          </div>
          {transcripts.map((entry) => (
            <div
              key={entry.id}
              className={`p-2 rounded-lg flex items-start gap-2 ${
                entry.role === 'host'
                  ? 'bg-amber-950/20 border border-amber-500/20 text-slate-300'
                  : 'bg-indigo-950/20 border border-indigo-500/20 text-slate-300'
              }`}
            >
              <span className="font-bold text-[10px] uppercase tracking-wider shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {entry.role === 'host' ? 'Host' : 'Player'}
              </span>
              <p className="flex-1">{entry.text}</p>
              <span className="text-[10px] text-slate-500">{entry.timestamp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
