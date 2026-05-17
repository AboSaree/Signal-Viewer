// src/app/services/generator.service.ts
import { Injectable } from '@angular/core';

export const SAMPLE_RATE = 44100;

export interface GeneratorParams {
  frequency: number;
  velocity: number;
  duration: number;
  soundSpeed: number;
  waveform: 'sine' | 'sawtooth' | 'square' | 'triangle';
}

export interface GeneratorResult {
  samples: Float32Array;
  wavData: ArrayBuffer;
  audioBuffer: AudioBuffer;
  durationSec: number;
  wavSizeKb: number;
}

@Injectable({ providedIn: 'root' })
export class GeneratorService {

  private audioCtx: AudioContext | null = null;

  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  /** Returns one sample in [-1, 1] for a given waveform shape and phase. */
  getSample(type: string, phase: number): number {
    switch (type) {
      case 'sine':     return Math.sin(phase);
      case 'sawtooth': return 2 * ((phase / (2 * Math.PI)) % 1) - 1;
      case 'square':   return Math.sin(phase) >= 0 ? 1 : -1;
      case 'triangle': {
        const t = (phase / (2 * Math.PI)) % 1;
        return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
      }
      default: return Math.sin(phase);
    }
  }

  /** Biquad coefficients for a band-pass section at f0 with quality Q. */
  private butterworth2Biquad(f0: number, Q: number, fs: number) {
    const w0    = 2 * Math.PI * f0 / fs;
    const alpha = Math.sin(w0) / (2 * Q);
    const cosw0 = Math.cos(w0);
    const a0    = 1 + alpha;
    return {
      b: [alpha / a0, 0, -alpha / a0],
      a: [1, (-2 * cosw0) / a0, (1 - alpha) / a0]
    };
  }

  /** Applies a single biquad section in-place (Direct Form II transposed). */
  private applyBiquad(samples: Float32Array, coef: { b: number[], a: number[] }): Float32Array {
    const { b, a } = coef;
    const out = new Float32Array(samples.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < samples.length; i++) {
      const x0 = samples[i];
      const y0 = b[0]*x0 + b[1]*x1 + b[2]*x2 - a[1]*y1 - a[2]*y2;
      out[i] = y0;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    return out;
  }

  /** Full band-pass: high-pass at 50 Hz + two-pass low-pass at 2000 Hz. */
  bandPassFilter(samples: Float32Array, fs: number): Float32Array {
    const f0hp = 50, Q = 0.707;
    const w0hp = 2 * Math.PI * f0hp / fs;
    const aHp  = Math.sin(w0hp) / (2 * Q);
    const cHp  = Math.cos(w0hp);
    const a0hp = 1 + aHp;
    const hpCoef = {
      b: [(1 + cHp) / (2 * a0hp), -(1 + cHp) / a0hp, (1 + cHp) / (2 * a0hp)],
      a: [1, (-2 * cHp) / a0hp, (1 - aHp) / a0hp]
    };
    const lpCoef = this.butterworth2Biquad(2000, Q, fs);

    let s = this.applyBiquad(samples, hpCoef);
    s     = this.applyBiquad(s, lpCoef);
    s     = this.applyBiquad(s, lpCoef);
    return s;
  }

  /** Produces a mono 16-bit PCM WAV ArrayBuffer from a Float32Array. */
  encodeWAV(samples: Float32Array, sr: number): ArrayBuffer {
    const buf  = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buf);
    const write = (off: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };

    write(0, 'RIFF');
    view.setUint32(4,  36 + samples.length * 2, true);
    write(8,  'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16,    true);
    view.setUint16(20, 1,     true);
    view.setUint16(22, 1,     true);
    view.setUint32(24, sr,    true);
    view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2,     true);
    view.setUint16(34, 16,    true);
    write(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, samples[i] * 32767)), true);
    }
    return buf;
  }

  /** Main generation pipeline. Yields progress values via callback. */
  async generate(
    params: GeneratorParams,
    onProgress: (p: number, msg: string) => void
  ): Promise<GeneratorResult> {
    const { frequency: f0, velocity: vs, duration: dur, soundSpeed: vsound, waveform: wtype } = params;

    onProgress(0.1, 'Simulating Doppler shift...');
    await new Promise(r => setTimeout(r, 10));

    const N       = Math.floor(SAMPLE_RATE * dur);
    const samples = new Float32Array(N);
    const halfDur = dur / 2;
    let phase     = 0;

    for (let i = 0; i < N; i++) {
      const t           = i / SAMPLE_RATE;
      const k           = 6 / dur;
      const sourceFactor = Math.tanh(k * (t - halfDur));

      const vsRadial = vs * sourceFactor;
      const fObs     = f0 * vsound / (vsound - vsRadial);

      const distNorm = 1 - 0.7 * sourceFactor;
      const amp      = Math.min(1.0, 1.0 / distNorm);

      phase += (2 * Math.PI * fObs) / SAMPLE_RATE;
      if (phase > 2 * Math.PI * 1e6) phase -= 2 * Math.PI * 1e6;

      samples[i] = amp * this.getSample(wtype, phase);
    }

    onProgress(0.4, 'Applying band-pass filter (50–4000 Hz)...');
    await new Promise(r => setTimeout(r, 10));

    const filtered = this.bandPassFilter(samples, SAMPLE_RATE);
    let peak = 0;
    for (let i = 0; i < filtered.length; i++) peak = Math.max(peak, Math.abs(filtered[i]));
    if (peak > 0) for (let i = 0; i < filtered.length; i++) filtered[i] /= peak;

    onProgress(0.7, 'Encoding WAV...');
    await new Promise(r => setTimeout(r, 10));

    const wavData = this.encodeWAV(filtered, SAMPLE_RATE);
    const ctx = this.getAudioCtx();
    const audioBuffer = ctx.createBuffer(1, filtered.length, SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(filtered);

    onProgress(1.0, `Done. ${(filtered.length / SAMPLE_RATE).toFixed(1)}s · ${SAMPLE_RATE} Hz · ${(wavData.byteLength / 1024).toFixed(0)} KB`);

    return {
      samples: filtered,
      wavData,
      audioBuffer,
      durationSec: filtered.length / SAMPLE_RATE,
      wavSizeKb: wavData.byteLength / 1024
    };
  }

  /** Play an AudioBuffer through the shared AudioContext. Returns the source node. */
  play(audioBuffer: AudioBuffer): AudioBufferSourceNode {
    const ctx = this.getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
    return source;
  }

  /** Stop a currently playing source node gracefully. */
  stop(source: AudioBufferSourceNode | null): void {
    if (source) {
      try { source.stop(); } catch { /* already stopped */ }
    }
  }

  /** Trigger a WAV file download in the browser. */
  downloadWAV(wavData: ArrayBuffer, filename?: string): void {
    const blob = new Blob([wavData], { type: 'audio/wav' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename ?? `doppler_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
