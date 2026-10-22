/**
 * Web Audio utilities for Gemini Live:
 * 1. 24kHz raw PCM little-endian playback with gapless scheduling
 * 2. 16kHz raw PCM capture
 * 3. Pure Web Audio synthesizer for game show SFX (ding, buzzer, cash register, fanfare)
 */

export class PcmAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  public onPlayingChange?: (isPlaying: boolean) => void;
  private isCurrentlyPlaying = false;

  constructor() {
    // Lazy initialize on user gesture
  }

  private initContext() {
    if (!this.audioCtx) {
      // Gemini Live outputs 24kHz mono 16-bit PCM
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: 24000 });
      this.nextStartTime = this.audioCtx.currentTime;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public playChunk(base64Data: string) {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const buffer = new ArrayBuffer(len);
      const view = new DataView(buffer);

      for (let i = 0; i < len; i++) {
        view.setUint8(i, binaryStr.charCodeAt(i));
      }

      // Convert 16-bit PCM LE to Float32
      const numSamples = Math.floor(len / 2);
      const float32Data = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const int16 = view.getInt16(i * 2, true);
        float32Data[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
      }

      const audioBuffer = this.audioCtx.createBuffer(1, numSamples, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      // Schedule gapless playback
      const currentTime = this.audioCtx.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.activeSources.push(source);

      if (!this.isCurrentlyPlaying) {
        this.isCurrentlyPlaying = true;
        this.onPlayingChange?.(true);
      }

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        if (this.activeSources.length === 0) {
          this.isCurrentlyPlaying = false;
          this.onPlayingChange?.(false);
        }
      };
    } catch (e) {
      console.error('Error playing PCM audio chunk:', e);
    }
  }

  public interrupt() {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {
        // Ignore stop error
      }
    }
    this.activeSources = [];
    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime;
    }
    if (this.isCurrentlyPlaying) {
      this.isCurrentlyPlaying = false;
      this.onPlayingChange?.(false);
    }
  }

  public getContext(): AudioContext | null {
    return this.audioCtx;
  }
}

/**
 * Microphone audio recorder producing 16kHz 16-bit PCM Base64
 */
export class MicAudioRecorder {
  private inputAudioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isRecording = false;

  public async start(onAudioData: (base64Pcm: string) => void): Promise<boolean> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioCtx = new AudioCtxClass({ sampleRate: 16000 });
      const source = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);

      // 4096 buffer size
      this.processor = this.inputAudioCtx.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32 to 16-bit PCM Little Endian
        const buffer = new ArrayBuffer(inputData.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          const val = s < 0 ? s * 0x8000 : s * 0x7fff;
          view.setInt16(i * 2, val, true);
        }

        // Base64 encode
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        onAudioData(base64);
      };

      source.connect(this.processor);
      this.processor.connect(this.inputAudioCtx.destination);
      this.isRecording = true;
      return true;
    } catch (err) {
      console.warn('Microphone permission not granted or device unavailable:', err);
      return false;
    }
  }

  public stop() {
    this.isRecording = false;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputAudioCtx) {
      this.inputAudioCtx.close();
      this.inputAudioCtx = null;
    }
  }

  public isCapturing(): boolean {
    return this.isRecording;
  }
}

/**
 * Pure Web Audio Sound Effects synthesizer for game show vibes
 */
export class GameSoundEffects {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Cheerful Ding for correct answer
   */
  public playCorrectDing() {
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;

      // Two harmonic bell tones
      [587.33, 880, 1174.66].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.7);
      });
    } catch (e) {
      // Audio might be blocked before interaction
    }
  }

  /**
   * Friendly buzzer for incorrect answer
   */
  public playIncorrectBuzzer() {
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.setValueAtTime(110, now + 0.15);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      // Audio error
    }
  }

  /**
   * Cash register cha-ching for points scored
   */
  public playChaChing() {
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.55);
    } catch (e) {
      // Audio error
    }
  }

  /**
   * Game show fanfare for winners or game start
   */
  public playFanfare() {
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;
      const notes = [
        { f: 523.25, t: 0, d: 0.12 },     // C5
        { f: 659.25, t: 0.12, d: 0.12 },  // E5
        { f: 783.99, t: 0.24, d: 0.12 },  // G5
        { f: 1046.5, t: 0.36, d: 0.4 },   // C6
      ];

      notes.forEach(({ f, t, d }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + t);

        gain.gain.setValueAtTime(0.2, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + t);
        osc.stop(now + t + d + 0.05);
      });
    } catch (e) {
      // Audio error
    }
  }
}
