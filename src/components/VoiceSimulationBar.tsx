import React, { useState } from 'react';
import { AuthoritativeGameState } from '../game/engine.ts';
import { Mic, Send, Lightbulb, RotateCcw, FastForward, Play, Pause, RefreshCw, Trophy } from 'lucide-react';

interface VoiceSimulationBarProps {
  state: AuthoritativeGameState;
  onSendVoiceUtterance: (text: string) => void;
  onDirectAction: (action: string, payload: any) => void;
  isLive: boolean;
}

export const VoiceSimulationBar: React.FC<VoiceSimulationBarProps> = ({
  state,
  onSendVoiceUtterance,
  onDirectAction,
  isLive,
}) => {
  const [customText, setCustomText] = useState('');
  const { status, mode, current_question, players, active_player_id } = state;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    onSendVoiceUtterance(customText.trim());
    setCustomText('');
  };

  const activePlayer = players.find(p => p.id === active_player_id);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-3 pt-2">
      {/* Quick Voice Simulation Chips */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400 flex items-center gap-1">
            <Mic className="w-3.5 h-3.5 text-amber-400" /> Spoken Voice Controls & Suggestions
          </span>
          <span className="text-[11px] text-slate-500">
            {isLive ? 'Voice utterance sent to Live Host' : 'Click to trigger voice actions'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Onboarding suggestions */}
          {(status === 'idle' || status === 'onboarding') && players.length === 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("Hi! We have two players today: Alex and Jordan.");
                  onDirectAction('register_players', { names: ['Alex', 'Jordan'] });
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold transition"
              >
                🗣️ "We are Alex and Jordan"
              </button>
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("Hey there! Introducing Maya, Liam, and Chloe.");
                  onDirectAction('register_players', { names: ['Maya', 'Liam', 'Chloe'] });
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold transition"
              >
                🗣️ "Maya, Liam, and Chloe"
              </button>
            </>
          )}

          {/* Mode Selection suggestions */}
          {(status === 'onboarding' || status === 'ready') && players.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("We want to play Team Mode!");
                  onDirectAction('select_mode', { mode: 'team' });
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  mode === 'team'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                👥 "We choose Team Mode"
              </button>
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("Let's do Player versus Player mode!");
                  onDirectAction('select_mode', { mode: 'pvp' });
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  mode === 'pvp'
                    ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                ⚔️ "Player vs Player Mode"
              </button>
            </>
          )}

          {/* Ready to start confirmation */}
          {status === 'ready' && (
            <button
              type="button"
              onClick={() => {
                onSendVoiceUtterance("Yes! We understand the rules and we are ready to play!");
                onDirectAction('confirm_ready', {});
              }}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-lg transition flex items-center gap-1.5 animate-pulse"
            >
              <Play className="w-3.5 h-3.5" /> 🗣️ "We are ready, let's play!"
            </button>
          )}

          {/* Active Question actions */}
          {status === 'active' && current_question && (
            <>
              {/* Correct Answer button for fast testing */}
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance(`Our answer is ${current_question.answer_key}`);
                  onDirectAction('submit_answer', {
                    verdict: 'correct',
                    answer: current_question.answer_key,
                    explanation: current_question.explanation,
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition flex items-center gap-1"
              >
                ✅ Speak Correct: "{current_question.answer_key}"
              </button>

              {/* Incorrect Answer button */}
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("We guess Honolulu!");
                  onDirectAction('submit_answer', {
                    verdict: 'incorrect',
                    answer: 'Honolulu',
                    explanation: current_question.explanation,
                  });
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-semibold transition"
              >
                ❌ Speak Incorrect Guess
              </button>

              {/* Hint request */}
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("Could we please get a hint on this one?");
                  onDirectAction('request_hint', {});
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold transition flex items-center gap-1"
              >
                <Lightbulb className="w-3.5 h-3.5" /> 🗣️ "Give us a hint"
              </button>

              {/* Repeat question */}
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("Can you please repeat the question?");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 🗣️ "Repeat question"
              </button>

              {/* Skip question */}
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("We're going to skip this question.");
                  onDirectAction('skip_question', {});
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-xs font-semibold transition flex items-center gap-1"
              >
                <FastForward className="w-3.5 h-3.5" /> 🗣️ "We skip"
              </button>

              {/* Query Score */}
              <button
                type="button"
                onClick={() => {
                  onSendVoiceUtterance("Host, what is our current score?");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-xs font-semibold transition flex items-center gap-1"
              >
                <Trophy className="w-3.5 h-3.5" /> 🗣️ "What is the score?"
              </button>
            </>
          )}

          {/* Pause / Resume */}
          {status === 'active' && (
            <button
              type="button"
              onClick={() => {
                onSendVoiceUtterance("Hold on, let's pause for a moment.");
                onDirectAction('pause_game', {});
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-xs font-semibold transition flex items-center gap-1"
            >
              <Pause className="w-3.5 h-3.5" /> 🗣️ "Pause"
            </button>
          )}

          {status === 'paused' && (
            <button
              type="button"
              onClick={() => {
                onSendVoiceUtterance("We're back, resume the game!");
                onDirectAction('resume_game', {});
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-300 text-xs font-bold transition flex items-center gap-1"
            >
              <Play className="w-3.5 h-3.5" /> 🗣️ "Resume game"
            </button>
          )}

          {/* Restart */}
          {status !== 'idle' && (
            <button
              type="button"
              onClick={() => {
                onSendVoiceUtterance("Let's restart the game from the beginning!");
                onDirectAction('restart_game', {});
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-500 hover:text-slate-300 text-xs font-medium transition flex items-center gap-1 ml-auto"
            >
              <RefreshCw className="w-3 h-3" /> Restart Show
            </button>
          )}
        </div>
      </div>

      {/* Freeform Voice Speech Simulation Input */}
      <form onSubmit={handleCustomSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={
              status === 'active' && activePlayer
                ? `Speak for ${activePlayer.name}: "Our answer is..."`
                : 'Type any spoken phrase for the host...'
            }
            className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>
        <button
          type="submit"
          disabled={!customText.trim()}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed shadow"
        >
          <Send className="w-3.5 h-3.5" /> Speak
        </button>
      </form>
    </div>
  );
};
