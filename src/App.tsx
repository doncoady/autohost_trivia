import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthoritativeGameState } from './game/engine.ts';
import { PcmAudioPlayer, MicAudioRecorder, GameSoundEffects } from './utils/audio.ts';
import { AudioOrb } from './components/AudioOrb.tsx';
import { GameHUD } from './components/GameHUD.tsx';
import { VoiceSimulationBar } from './components/VoiceSimulationBar.tsx';
import { SpokenCaptions, TranscriptEntry } from './components/SpokenCaptions.tsx';
import { Sparkles, Mic, MicOff, Volume2, VolumeX, Info, Radio } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<AuthoritativeGameState>({
    mode: 'team',
    status: 'idle',
    players: [],
    team_score: 0,
    strike_count: 0,
    question_index: 0,
    round_index: 1,
    active_player_id: null,
    current_question: null,
    is_sudden_death: false,
    winner_id: null,
    winner_name: null,
    used_question_ids: [],
    turn_order: [],
    turn_index: 0,
  });

  const [isLive, setIsLive] = useState(false);
  const [hostStatus, setHostStatus] = useState<'idle' | 'host_speaking' | 'listening' | 'processing'>('idle');
  const [micEnabled, setMicEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [latestHostUtterance, setLatestHostUtterance] = useState<string>('');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);

  // Audio subsystem refs
  const pcmPlayerRef = useRef<PcmAudioPlayer | null>(null);
  const micRecorderRef = useRef<MicAudioRecorder | null>(null);
  const sfxRef = useRef<GameSoundEffects | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize Audio subsystems once
  useEffect(() => {
    pcmPlayerRef.current = new PcmAudioPlayer();
    micRecorderRef.current = new MicAudioRecorder();
    sfxRef.current = new GameSoundEffects();

    pcmPlayerRef.current.onPlayingChange = (isPlaying) => {
      setHostStatus((prev) => (isPlaying ? 'host_speaking' : micEnabled ? 'listening' : 'idle'));
    };

    return () => {
      micRecorderRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  // Update listening status when mic state changes
  useEffect(() => {
    if (isLive && hostStatus !== 'host_speaking') {
      setHostStatus(micEnabled ? 'listening' : 'idle');
    }
  }, [micEnabled, isLive]);

  // Connect to server WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/live`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsLive(true);
      setConnectionNotice(null);
      ws.send(JSON.stringify({ type: 'start_session' }));
      if (soundEnabled) sfxRef.current?.playFanfare();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'state_update') {
          const prevState = gameState;
          const nextState: AuthoritativeGameState = msg.state;
          setGameState(nextState);

          // Check for sound effect triggers
          if (msg.last_action && soundEnabled) {
            const { name, result } = msg.last_action;
            if (name === 'submit_answer') {
              if (result.outcome?.verdict === 'correct') {
                sfxRef.current?.playCorrectDing();
                setTimeout(() => sfxRef.current?.playChaChing(), 250);
              } else if (result.outcome?.verdict === 'incorrect') {
                sfxRef.current?.playIncorrectBuzzer();
              }
            }
          }

          if (nextState.status === 'finished' && prevState.status !== 'finished' && soundEnabled) {
            sfxRef.current?.playFanfare();
          }
        } else if (msg.type === 'audio') {
          // Play 24kHz PCM from Gemini Live
          pcmPlayerRef.current?.playChunk(msg.data);
        } else if (msg.type === 'interrupted') {
          pcmPlayerRef.current?.interrupt();
        } else if (msg.type === 'transcript') {
          const entry: TranscriptEntry = {
            id: `t_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            role: msg.role,
            text: msg.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          };
          setTranscripts((prev) => [entry, ...prev.slice(0, 40)]);
          if (msg.role === 'host') {
            setLatestHostUtterance(msg.text);
          }
        } else if (msg.type === 'connection_error') {
          setConnectionNotice(msg.message);
        }
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    ws.onclose = () => {
      setIsLive(false);
      setHostStatus('idle');
    };

    ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
    };
  }, [gameState, soundEnabled]);

  // Handle autostart query parameter ?autostart=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      connectWebSocket();
    }
  }, [connectWebSocket]);

  // Start microphone capture
  const startMic = async () => {
    if (!micRecorderRef.current) return;
    const ok = await micRecorderRef.current.start((base64Pcm) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
      }
    });

    if (ok) {
      setMicEnabled(true);
      setHostStatus('listening');
    } else {
      setConnectionNotice('Microphone unavailable or permission denied. Voice Simulation chips are available below!');
    }
  };

  const stopMic = () => {
    micRecorderRef.current?.stop();
    setMicEnabled(false);
    setHostStatus('idle');
  };

  const toggleMic = () => {
    if (!isLive) {
      connectWebSocket();
      startMic();
      return;
    }
    if (micEnabled) {
      stopMic();
    } else {
      startMic();
    }
  };

  const sendVoiceUtterance = (text: string) => {
    if (!isLive) {
      connectWebSocket();
    }

    // Add player entry to transcripts
    const entry: TranscriptEntry = {
      id: `u_${Date.now()}`,
      role: 'player',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setTranscripts((prev) => [entry, ...prev.slice(0, 40)]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'user_text', text }));
    }
  };

  const handleDirectAction = (action: string, payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'direct_action', action, payload }));
    } else {
      // Local fallback if offline
      connectWebSocket();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Game Show Header */}
      <header className="border-b border-slate-900 bg-slate-950/90 sticky top-0 z-40 backdrop-blur px-3 sm:px-4 py-2.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 shrink-0">
              <Radio className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5 text-white">
                AUTOHOST TRIVIA
                <span className="hidden sm:inline-block text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  LIVE VOICE
                </span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-none">
                Interactive Voice Game Show • Gemini Live
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Rules Modal Button */}
            <button
              type="button"
              onClick={() => setShowRules(!showRules)}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center gap-1 transition"
              aria-label="Game Show Rules"
            >
              <Info className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Rules</span>
            </button>

            {/* Sound Effects Toggle */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-lg border transition ${
                soundEnabled
                  ? 'bg-slate-900 border-slate-800 text-slate-300'
                  : 'bg-slate-900 border-slate-800 text-slate-600'
              }`}
              aria-label={soundEnabled ? 'Mute Sound Effects' : 'Enable Sound Effects'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Live Connect / Mic Toggle */}
            <button
              type="button"
              onClick={toggleMic}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition shadow-lg ${
                !isLive
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950'
                  : micEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
                  : 'bg-rose-900/80 hover:bg-rose-800 border border-rose-500/40 text-rose-200'
              }`}
            >
              {!isLive ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" /> Start Show
                </>
              ) : micEnabled ? (
                <>
                  <Mic className="w-3.5 h-3.5 animate-pulse" /> Mic Live
                </>
              ) : (
                <>
                  <MicOff className="w-3.5 h-3.5" /> Mic Muted
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Connection Notice / Warning */}
      {connectionNotice && (
        <div className="bg-amber-950/60 border-b border-amber-600/40 px-4 py-2 text-xs text-amber-200 text-center flex items-center justify-center gap-2">
          <span>{connectionNotice}</span>
          <button
            type="button"
            onClick={() => setConnectionNotice(null)}
            className="text-amber-400 underline font-semibold ml-2 hover:text-amber-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Rules Drawer */}
      {showRules && (
        <div className="bg-slate-900/95 border-b border-slate-800 p-4 max-w-3xl mx-auto w-full text-xs text-slate-300 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-sm text-amber-300 uppercase tracking-wider">
              Autohost Trivia Game Show Rules
            </h3>
            <button
              type="button"
              onClick={() => setShowRules(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="font-bold text-amber-400">👥 Team Mode (Collaborative)</span>
              <p>Ten questions total. Everyone discusses and gives one final answer.</p>
              <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                <li>Questions 1–3: $25 each</li>
                <li>Questions 4–6: $50 each</li>
                <li>Questions 7–10: $100 each</li>
                <li>Maximum Team Score: $625</li>
              </ul>
            </div>
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="font-bold text-emerald-400">⚔️ Player vs Player (2–4 Players)</span>
              <p>Three rounds of individual competition. Turns rotate fairly each round.</p>
              <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                <li>Round 1: $25 questions</li>
                <li>Round 2: $50 questions</li>
                <li>Round 3: $100 questions (Max regular score $175)</li>
                <li>Ties trigger Sudden Death rounds ($100 each)</li>
              </ul>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Hints: 1 free hint per question upon request. Skips award $0 without penalty. Scores are authoritatively tracked by the application.
          </p>
        </div>
      )}

      {/* Main Game Show Stage */}
      <main className="flex-1 flex flex-col items-center justify-between p-4 sm:p-6 max-w-4xl w-full mx-auto space-y-4">
        {/* Authoritative Scoreboard & HUD */}
        <GameHUD state={gameState} isLive={isLive} />

        {/* Central Sonic Audio Orb */}
        <AudioOrb
          status={hostStatus}
          isLive={isLive}
          onToggleMic={toggleMic}
          micEnabled={micEnabled}
        />

        {/* Spoken Speech Captions (Accessibility & Audio-Voice Transcript) */}
        <SpokenCaptions
          transcripts={transcripts}
          latestHostUtterance={
            latestHostUtterance ||
            (gameState.status === 'idle'
              ? 'Welcome to Autohost Trivia! Press "Start Show" to connect your live host.'
              : gameState.status === 'onboarding'
              ? 'Tell me the names of everyone playing today!'
              : gameState.current_question?.text || '')
          }
        />

        {/* Voice Simulation Bar & Spoken Utterance Chips */}
        <VoiceSimulationBar
          state={gameState}
          onSendVoiceUtterance={sendVoiceUtterance}
          onDirectAction={handleDirectAction}
          isLive={isLive}
        />
      </main>

      {/* Stage Footer */}
      <footer className="border-t border-slate-900/80 px-4 py-2.5 text-center text-[11px] text-slate-500">
        Autohost Trivia Voice Engine • Powered by Gemini Live WebSocket Audio • Voice-First Gameplay
      </footer>
    </div>
  );
}
