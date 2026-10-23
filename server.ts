import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, Type, FunctionDeclaration, LiveServerMessage } from '@google/genai';
import { AutohostGameEngine, AuthoritativeGameState } from './src/game/engine.ts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

app.use(express.json());

// Initialize Google GenAI client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
});

const toolsDeclarations: FunctionDeclaration[] = [
  {
    name: 'register_players',
    description: 'Registers player names or nicknames provided by the players during onboarding.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        player_names: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'The list of player names or nicknames.',
        },
      },
      required: ['player_names'],
    },
  },
  {
    name: 'select_game_mode',
    description: 'Selects the game mode chosen by players: "team" or "pvp".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          enum: ['team', 'pvp'],
          description: 'The game mode: "team" for collaborative play or "pvp" for player vs player.',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'confirm_ready_to_start',
    description: 'Called after onboarding rules are explained and players confirm they are ready to begin.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        confirmed: {
          type: Type.BOOLEAN,
          description: 'True when players explicitly say they are ready to start playing.',
        },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'submit_answer',
    description: 'Reports the evaluated outcome of an attempted answer by a player or team.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        verdict: {
          type: Type.STRING,
          enum: ['correct', 'incorrect', 'clarification_needed'],
          description: 'The verdict for the answer: "correct", "incorrect", or "clarification_needed" if ambiguous.',
        },
        recognized_answer: {
          type: Type.STRING,
          description: 'The answer recognized from the player speech.',
        },
        explanation: {
          type: Type.STRING,
          description: 'Brief factual explanation or color commentary to accompany the answer result.',
        },
      },
      required: ['verdict', 'recognized_answer'],
    },
  },
  {
    name: 'request_hint',
    description: 'Requests the approved hint for the current trivia question. Allowed once per question without penalty.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'Optional player request explanation.',
        },
      },
    },
  },
  {
    name: 'skip_question',
    description: 'Called when the player or team explicitly skips the current question.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: 'Reason for skipping.',
        },
      },
    },
  },
  {
    name: 'repeat_question',
    description: 'Called when a player asks to repeat the current question.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'pause_game',
    description: 'Pauses the game upon player request.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'resume_game',
    description: 'Resumes the game from a paused state.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'query_score',
    description: 'Called when players ask for the current score or standings.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'restart_game',
    description: 'Restarts the trivia game when explicitly requested.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'quit_game',
    description: 'Ends the trivia game upon player request.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

const HOST_SYSTEM_INSTRUCTION = `
You are the charismatic, witty, high-energy host of Autohost Trivia, an interactive voice trivia game show designed to be played entirely using audio and voice input.
Your personality is enthusiastic, engaging, playfully humorous, suspenseful, and warm. You sound natural and responsive.

VOICE GUIDELINES:
- Speak naturally and enthusiastically, using short, clear, conversational sentences.
- Never speak Markdown, bullet points, asterisks, brackets, code, JSON, internal IDs, or stage directions aloud.
- Use occasional spoken sound effects (e.g., "Ding!", "Ba-dum-tss!", "Whoosh!", "Dun-dun-dun!"), dramatic pauses, and original catchphrases.
- Address participants by their chosen names or nicknames throughout the game.
- Keep feedback brief: normally one or two punchy sentences before moving on.
- Celebrate correct answers enthusiastically!
- Respond humorously and encouragingly to mistakes. Never shame or insult a player.
- Keep the game moving without rushing players who need a moment.
- Never imitate specific TV show trademarks or catchphrases.

ONBOARDING FLOW:
1. In your very first turn, welcome the players enthusiastically to Autohost Trivia and ask for their names or nicknames! (e.g. "Welcome to Autohost Trivia! Tell me the names or nicknames of everyone playing today!")
2. As soon as names are provided, invoke the \`register_players\` tool with their names.
3. Then ask them to choose their mode:
   - Team Mode: Everyone collaborates to answer questions towards one shared team score.
   - Player vs Player Mode: 2 to 4 players compete individually with their own scores.
4. Once they choose, invoke \`select_game_mode\` with "team" or "pvp".
5. Briefly explain the essential rules, then ask if everyone is ready to play.
6. When they say ready, call \`confirm_ready_to_start\`.

GAMEPLAY & ANSWER RESOLUTION:
- Ask exactly ONE trivia question at a time. The authoritative current question, value, and answer key will be supplied to you by the application in the game state.
- In Player vs Player mode, always address the active player by name and state clearly that it is their turn.
- When an answer is spoken, evaluate it against the supplied answer key and accepted alternatives.
- Invoke \`submit_answer\` with verdict: "correct", "incorrect", or "clarification_needed".
- If the player asks for a hint, call \`request_hint\`.
- If the player asks to repeat, call \`repeat_question\` and repeat it clearly.
- If the player skips, call \`skip_question\`.
- If asked about score, call \`query_score\` and announce the authoritative scores from the state.
- In Team Mode, announce the final score out of $625 when all 10 questions are done!
- In PvP Mode, announce the winner and congratulate all players warmly!
- NEVER reveal the correct answer until the answer is submitted, skipped, or explicitly requested.
- APPLICATION STATE IS THE SOLE AUTHORITY: Always use the score, round, and question supplied by the application in the tool response.
`;

// Shared active engines per client connection
interface SessionContext {
  engine: AutohostGameEngine;
  liveSession: any | null;
  clientWs: WebSocket;
  isConnecting: boolean;
}

const activeSessions = new Map<WebSocket, SessionContext>();

wss.on('connection', async (clientWs: WebSocket) => {
  const engine = new AutohostGameEngine();
  const sessionCtx: SessionContext = {
    engine,
    liveSession: null,
    clientWs,
    isConnecting: false,
  };
  activeSessions.set(clientWs, sessionCtx);

  // Send initial state to client
  clientWs.send(JSON.stringify({
    type: 'state_update',
    state: engine.getState(),
  }));

  const connectGeminiLive = async () => {
    if (sessionCtx.liveSession || sessionCtx.isConnecting) return;
    sessionCtx.isConnecting = true;

    try {
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured on server.');
      }

      const session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' }, // Energetic game show voice
            },
          },
          systemInstruction: HOST_SYSTEM_INSTRUCTION,
          // @ts-ignore
          outputAudioTranscription: {},
          // @ts-ignore
          inputAudioTranscription: {},
          tools: [{ functionDeclarations: toolsDeclarations }],
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle Audio Output from Gemini Live
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data, // 24kHz raw PCM little-endian
                  }));
                }
              }
            }

            // 2. Handle Interruption
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }

            // 3. Handle Transcriptions
            // @ts-ignore
            if (message.serverContent?.outputAudioTranscription?.text) {
              clientWs.send(JSON.stringify({
                type: 'transcript',
                role: 'host',
                // @ts-ignore
                text: message.serverContent.outputAudioTranscription.text,
              }));
            }
            // @ts-ignore
            if (message.serverContent?.inputAudioTranscription?.text) {
              clientWs.send(JSON.stringify({
                type: 'transcript',
                role: 'player',
                // @ts-ignore
                text: message.serverContent.inputAudioTranscription.text,
              }));
            }

            // 4. Handle Tool / Function Calls
            if (message.toolCall?.functionCalls) {
              const responses = [];
              for (const call of message.toolCall.functionCalls) {
                const callId = call.id;
                const name = call.name;
                const args = (call.args || {}) as any;

                let toolResult: any = { status: 'ok' };

                if (name === 'register_players') {
                  const playerNames = args.player_names || [];
                  const reg = engine.registerPlayers(playerNames);
                  toolResult = {
                    success: reg.success,
                    message: reg.message,
                    state: engine.getState(),
                  };
                } else if (name === 'select_game_mode') {
                  const mode = args.mode || 'team';
                  const sel = engine.selectMode(mode);
                  toolResult = {
                    success: sel.success,
                    message: sel.message,
                    state: engine.getState(),
                  };
                } else if (name === 'confirm_ready_to_start') {
                  const start = engine.confirmReady();
                  toolResult = {
                    success: start.success,
                    message: start.message,
                    state: engine.getState(),
                  };
                } else if (name === 'submit_answer') {
                  const verdict = args.verdict || 'incorrect';
                  const recognizedAnswer = args.recognized_answer || '';
                  const explanation = args.explanation || '';
                  const outcome = engine.submitAnswer(verdict, recognizedAnswer, explanation);
                  toolResult = {
                    outcome,
                    state: engine.getState(),
                  };
                } else if (name === 'request_hint') {
                  const hintRes = engine.requestHint();
                  toolResult = {
                    ...hintRes,
                    state: engine.getState(),
                  };
                } else if (name === 'skip_question') {
                  const skipRes = engine.skipQuestion();
                  toolResult = {
                    ...skipRes,
                    state: engine.getState(),
                  };
                } else if (name === 'repeat_question') {
                  toolResult = {
                    repeated: true,
                    state: engine.getState(),
                  };
                } else if (name === 'pause_game') {
                  engine.pauseGame();
                  toolResult = { state: engine.getState() };
                } else if (name === 'resume_game') {
                  engine.resumeGame();
                  toolResult = { state: engine.getState() };
                } else if (name === 'query_score') {
                  toolResult = {
                    score_summary: engine.getState().mode === 'team'
                      ? `Team score: $${engine.getState().team_score}`
                      : engine.getState().players.map(p => `${p.name}: $${p.score}`).join(', '),
                    state: engine.getState(),
                  };
                } else if (name === 'restart_game') {
                  engine.restartGame();
                  toolResult = { state: engine.getState() };
                } else if (name === 'quit_game') {
                  engine.quitGame();
                  toolResult = { state: engine.getState() };
                }

                responses.push({
                  id: callId,
                  name,
                  response: { output: toolResult },
                });

                // Broadcast state to client UI
                clientWs.send(JSON.stringify({
                  type: 'state_update',
                  state: engine.getState(),
                  last_action: { name, args, result: toolResult },
                }));
              }

              // Send tool responses back to Gemini Live
              if (sessionCtx.liveSession) {
                sessionCtx.liveSession.sendToolResponse({ functionResponses: responses });
              }
            }
          },
          onclose: () => {
            sessionCtx.liveSession = null;
            clientWs.send(JSON.stringify({ type: 'session_closed' }));
          },
          onerror: (err: any) => {
            console.error('Gemini Live error:', err);
            clientWs.send(JSON.stringify({ type: 'error', message: err?.message || 'Gemini Live error' }));
          },
        },
      });

      sessionCtx.liveSession = session;
      sessionCtx.isConnecting = false;

      clientWs.send(JSON.stringify({
        type: 'session_ready',
        message: 'Connected to Gemini Live game host!',
      }));

      // Trigger the host greeting if start of game
      if (engine.getState().status === 'idle') {
        engine.startOnboarding();
        clientWs.send(JSON.stringify({
          type: 'state_update',
          state: engine.getState(),
        }));
        session.sendRealtimeInput({
          text: 'Start now. Introduce Autohost Trivia with huge charisma and enthusiasm, and ask the players for their names or nicknames to kick off onboarding!',
        });
      }
    } catch (err: any) {
      sessionCtx.isConnecting = false;
      console.error('Failed to connect to Gemini Live:', err);
      clientWs.send(JSON.stringify({
        type: 'connection_error',
        message: err?.message || 'Failed to connect to Gemini Live.',
        fallback_available: true,
      }));
    }
  };

  clientWs.on('message', async (rawMsg: Buffer | string) => {
    try {
      const msg = JSON.parse(rawMsg.toString());

      if (msg.type === 'start_session') {
        await connectGeminiLive();
      } else if (msg.type === 'audio' && msg.data) {
        // Forward client microphone PCM chunk to Gemini Live
        if (sessionCtx.liveSession) {
          sessionCtx.liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        }
      } else if (msg.type === 'user_text' && msg.text) {
        // Forward text utterance to Gemini Live (for speech simulation / typed input / testing)
        if (sessionCtx.liveSession) {
          sessionCtx.liveSession.sendRealtimeInput({
            text: msg.text,
          });
        }
      } else if (msg.type === 'direct_action') {
        // Direct state engine interaction for fallback/controls/verification
        const { action, payload } = msg;
        let actionResult: any = null;

        if (action === 'register_players') {
          actionResult = engine.registerPlayers(payload.names);
        } else if (action === 'select_mode') {
          actionResult = engine.selectMode(payload.mode);
        } else if (action === 'confirm_ready') {
          actionResult = engine.confirmReady();
        } else if (action === 'submit_answer') {
          actionResult = engine.submitAnswer(payload.verdict, payload.answer, payload.explanation);
        } else if (action === 'request_hint') {
          actionResult = engine.requestHint();
        } else if (action === 'skip_question') {
          actionResult = engine.skipQuestion();
        } else if (action === 'pause_game') {
          actionResult = engine.pauseGame();
        } else if (action === 'resume_game') {
          actionResult = engine.resumeGame();
        } else if (action === 'restart_game') {
          actionResult = engine.restartGame();
        } else if (action === 'quit_game') {
          actionResult = engine.quitGame();
        }

        // Notify client
        clientWs.send(JSON.stringify({
          type: 'state_update',
          state: engine.getState(),
          direct_action_result: actionResult,
        }));

        // Also inform Gemini Live if active
        if (sessionCtx.liveSession) {
          sessionCtx.liveSession.sendRealtimeInput({
            text: `[System Update: Action ${action} executed. Current State: ${JSON.stringify(engine.getState())}]`,
          });
        }
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  clientWs.on('close', () => {
    if (sessionCtx.liveSession) {
      try {
        sessionCtx.liveSession.close();
      } catch (e) {
        // Ignore close error
      }
    }
    activeSessions.delete(clientWs);
  });
});

// REST endpoint for status check and deterministic testing
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!apiKey,
    appName: 'Autohost Trivia',
  });
});

// Serve frontend in dev or prod
async function setupApp() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`Autohost Trivia server running on port ${PORT}`);
  });
}

setupApp();
