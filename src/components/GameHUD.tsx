import React from 'react';
import { AuthoritativeGameState } from '../game/engine.ts';
import { Trophy, HelpCircle, CheckCircle2, AlertCircle, Volume2 } from 'lucide-react';

interface GameHUDProps {
  state: AuthoritativeGameState;
  isLive: boolean;
}

export const GameHUD: React.FC<GameHUDProps> = ({ state, isLive }) => {
  const { mode, status, players, team_score, question_index, round_index, active_player_id, current_question, is_sudden_death, winner_name } = state;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-3.5">
      {/* On-Air & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/80 border border-red-500/50">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-red-800'}`} />
            <span className="text-[10px] sm:text-[11px] font-black tracking-wider text-red-400 uppercase">
              {isLive ? 'ON AIR' : 'OFF AIR'}
            </span>
          </div>

          <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
            {mode === 'team' ? 'Team Mode' : 'Player vs Player'}
          </div>

          {status === 'active' && (
            <span className="text-[10px] sm:text-xs font-bold text-amber-400 bg-amber-950/60 border border-amber-600/40 px-2 py-0.5 rounded">
              {is_sudden_death
                ? 'SUDDEN DEATH'
                : mode === 'team'
                ? `Q${question_index} of 10`
                : `Round ${round_index} of 3`}
            </span>
          )}
        </div>

        {/* Current Pot / Question Value */}
        {current_question && status === 'active' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase font-semibold">Question Value:</span>
            <span className="text-sm font-black text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-full shadow">
              ${current_question.value}
            </span>
          </div>
        )}
      </div>

      {/* Main Scoreboard */}
      {mode === 'team' ? (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 border border-indigo-900/50 shadow-xl text-center">
          <div className="text-xs uppercase tracking-widest text-indigo-300 font-bold mb-1">
            Collaborative Team Score
          </div>
          <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 drop-shadow">
            ${team_score}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Maximum Possible Score: $625
          </div>
          {players.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-slate-400">Team Players:</span>
              {players.map((p) => (
                <span
                  key={p.id}
                  className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 text-xs font-medium border border-slate-700"
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* PvP Mode Scoreboard */
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {players.map((player) => {
            const isActive = active_player_id === player.id && status === 'active';
            const isWinner = winner_name === player.name && status === 'finished';

            return (
              <div
                key={player.id}
                className={`relative p-3.5 rounded-xl border transition-all text-center ${
                  isActive
                    ? 'bg-amber-950/40 border-amber-400 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/10'
                    : isWinner
                    ? 'bg-emerald-950/50 border-emerald-400 ring-2 ring-emerald-400/50'
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                {isActive && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow">
                    Active Turn
                  </span>
                )}
                {isWinner && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.2 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow flex items-center gap-1">
                    <Trophy className="w-2.5 h-2.5" /> Winner
                  </span>
                )}
                <div className="text-sm font-bold text-slate-200 truncate mt-1">
                  {player.name}
                </div>
                <div className="text-2xl font-black text-amber-300 mt-0.5">
                  ${player.score}
                </div>
                <div className="text-[10px] text-slate-400">
                  {status === 'active' ? (isActive ? 'Answering now' : 'Waiting turn') : 'Score'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Current Active Question Display */}
      {status === 'active' && current_question && (
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 shadow backdrop-blur">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase font-extrabold tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Spoken Question ({current_question.category})
            </span>
            <div className="flex items-center gap-2">
              {current_question.hint_used && (
                <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-600/30 flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" /> Hint Used
                </span>
              )}
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded">
                ${current_question.value}
              </span>
            </div>
          </div>

          <p className="text-base sm:text-lg font-semibold text-slate-100 leading-snug">
            "{current_question.text}"
          </p>

          {current_question.hint_used && (
            <div className="mt-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Official Hint:</span> {current_question.hint}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Finished Game Summary */}
      {status === 'finished' && (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/70 to-slate-900 border border-emerald-500/50 text-center space-y-2 shadow-2xl">
          <Trophy className="w-12 h-12 text-yellow-400 mx-auto animate-bounce" />
          <h2 className="text-2xl font-black text-white">
            {mode === 'team' ? 'Game Complete! Congratulations Team!' : `${winner_name || 'Champion'} Wins Autohost Trivia!`}
          </h2>
          <p className="text-sm text-emerald-200">
            {mode === 'team'
              ? `The team finished with a grand total of $${team_score} out of $625!`
              : `A fantastic battle! High scores, sudden reveals, and glorious trivia mastery.`}
          </p>
        </div>
      )}
    </div>
  );
};
