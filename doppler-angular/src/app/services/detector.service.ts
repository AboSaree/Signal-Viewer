// src/app/services/detector.service.ts
import { Injectable } from '@angular/core';

export const SPEED_OF_SOUND = 343; // m/s at 20°C

export interface DetectorResult {
  velocity: number;       // m/s
  velocityKmh: number;
  baseFrequency: number;  // Hz
  fApproach: number;      // Hz
  fRecede: number;        // Hz
  confidence: number;     // 0-100
  smoothedFreqs: number[];
  activeTimes: number[];
  activeMags: number[];
  peakIdx: number;
  monoSamples: Float32Array;
  sampleRate: number;
}

@Injectable({ providedIn: 'root' })
export class DetectorService {

  /** Returns the value at percentile p (0–1) of an already-sorted array. */
  percentile(sorted: number[], p: number): number {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
    return sorted[idx];
  }

  /** 1-D median filter with a given half-window radius (5-point = radius 2). */
  medianFilter(arr: number[], radius: number): number[] {
    return arr.map((_, i) => {
      const lo  = Math.max(0, i - radius);
      const hi  = Math.min(arr.length - 1, i + radius);
      const win = arr.slice(lo, hi + 1).sort((a, b) => a - b);
      return win[Math.floor(win.length / 2)];
    });
  }

  /**
   * Partial DFT peak detector for one windowed frame.
   * Scans only bins in [binLo, binHi] (the 200–700 Hz range).
   * Parabolic interpolation gives sub-bin frequency accuracy (~0.5 Hz).
   */
  fftPeak(
    mono: Float32Array,
    start: number,
    N: number,
    hann: Float32Array,
    binLo: number,
    binHi: number,
    sr: number
  ): { freq: number; mag: number } {
    const windowed = new Float32Array(N);
    for (let i = 0; i < N && start + i < mono.length; i++) {
      windowed[i] = mono[start + i] * hann[i];
    }

    let peakMag = -1, peakBin = binLo;
    for (let k = binLo; k <= binHi; k++) {
      let re = 0, im = 0;
      const ps = 2 * Math.PI * k / N;
      for (let n = 0; n < N; n++) {
        re += windowed[n] * Math.cos(ps * n);
        im -= windowed[n] * Math.sin(ps * n);
      }
      const mag = re * re + im * im;
      if (mag > peakMag) { peakMag = mag; peakBin = k; }
    }

    // Parabolic interpolation for sub-bin accuracy
    let refinedBin = peakBin;
    if (peakBin > binLo && peakBin < binHi) {
      const getMag = (k: number) => {
        let re = 0, im = 0;
        const ps = 2 * Math.PI * k / N;
        for (let n = 0; n < N; n++) {
          re += windowed[n] * Math.cos(ps * n);
          im -= windowed[n] * Math.sin(ps * n);
        }
        return re * re + im * im;
      };
      const alpha = getMag(peakBin - 1);
      const beta  = peakMag;
      const gamma = getMag(peakBin + 1);
      const denom = alpha - 2 * beta + gamma;
      if (Math.abs(denom) > 1e-10) {
        refinedBin = peakBin + 0.5 * (alpha - gamma) / denom;
      }
    }

    return { freq: (refinedBin * sr) / N, mag: Math.sqrt(peakMag) };
  }

  /**
   * Main analysis pipeline.
   * Steps: decode → sliding DFT → energy gate → median filter → split → percentiles → Doppler formula.
   * Yields progress via onProgress callback.
   */
  async analyse(
    file: File,
    onProgress: (p: number, msg: string) => void
  ): Promise<DetectorResult> {
    onProgress(0.05, 'Loading audio file...');

    const arrayBuffer = await file.arrayBuffer();

    onProgress(0.10, 'Decoding audio...');
    await new Promise(r => setTimeout(r, 30));

    const audioCtx = new AudioContext();
    const audioBuf = await audioCtx.decodeAudioData(arrayBuffer);

    // Mix to mono
    const numCh  = audioBuf.numberOfChannels;
    const length = audioBuf.length;
    const mono   = new Float32Array(length);
    for (let ch = 0; ch < numCh; ch++) {
      const chData = audioBuf.getChannelData(ch);
      for (let i = 0; i < length; i++) mono[i] += chData[i];
    }
    for (let i = 0; i < length; i++) mono[i] /= numCh;

    const sr = audioBuf.sampleRate;

    // ── STEP 1 — Sliding Hann-windowed DFT (N=8192, hop=0.25 s) ──
    onProgress(0.20, 'Building frequency track (sliding Hann-windowed DFT)...');
    await new Promise(r => setTimeout(r, 30));

    const N          = 8192;
    const hopSamples = Math.floor(0.25 * sr);
    const hann       = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    }

    const binLo = Math.round(200 * N / sr);
    const binHi = Math.round(700 * N / sr);

    const trackFreqs: number[] = [], trackMags: number[] = [], trackTimes: number[] = [];
    for (let start = 0; start + N <= length; start += hopSamples) {
      const { freq, mag } = this.fftPeak(mono, start, N, hann, binLo, binHi, sr);
      trackFreqs.push(freq);
      trackMags.push(mag);
      trackTimes.push(parseFloat(((start + N / 2) / sr).toFixed(2)));
    }

    onProgress(0.55, 'Energy gate: keeping loudest 30% of frames...');

    if (trackFreqs.length < 4) {
      audioCtx.close();
      throw new Error('Audio too short for analysis (need ≥ 2 seconds).');
    }

    // ── STEP 2 — Energy gate: keep top 30% loudest frames ──
    onProgress(0.65, 'Energy gate: keeping loudest 30% of frames...');
    await new Promise(r => setTimeout(r, 20));

    const sortedMags      = [...trackMags].sort((a, b) => a - b);
    const energyThreshold = sortedMags[Math.floor(sortedMags.length * 0.70)];

    const activeFreqs: number[] = [], activeMags: number[] = [], activeTimes: number[] = [];
    for (let i = 0; i < trackFreqs.length; i++) {
      if (trackMags[i] >= energyThreshold) {
        activeFreqs.push(trackFreqs[i]);
        activeMags.push(trackMags[i]);
        activeTimes.push(trackTimes[i]);
      }
    }

    if (activeFreqs.length < 4) {
      audioCtx.close();
      throw new Error('No clear horn/siren detected. Ensure the audio contains a vehicle passing while honking.');
    }

    // ── STEP 3 — 5-point median filter ──
    onProgress(0.72, 'Smoothing frequency track (5-point median filter)...');
    await new Promise(r => setTimeout(r, 20));

    const smoothed = this.medianFilter(activeFreqs, 2);

    // ── STEP 4 — Split at peak-energy frame ──
    const peakIdx  = activeMags.indexOf(Math.max(...activeMags));
    const prePass  = smoothed.slice(0, Math.max(1, peakIdx));
    const postPass = smoothed.slice(peakIdx);

    // ── STEP 5 — 75th / 25th percentile estimates ──
    const preSorted  = [...prePass].sort((a, b) => a - b);
    const postSorted = [...postPass].sort((a, b) => a - b);

    let fApproach = this.percentile(preSorted,  0.75);
    let fRecede   = this.percentile(postSorted, 0.25);

    if (fRecede > fApproach) [fApproach, fRecede] = [fRecede, fApproach];

    // ── STEP 6 — Doppler formula: v = c × (fa − fr) / (fa + fr) ──
    const velocity      = SPEED_OF_SOUND * (fApproach - fRecede) / (fApproach + fRecede);
    const baseFrequency = (fApproach + fRecede) / 2;

    const shiftRatio = (fApproach - fRecede) / baseFrequency;
    const confidence = Math.min(98, Math.max(20, shiftRatio * 900));

    onProgress(0.90, 'Rendering results...');
    await new Promise(r => setTimeout(r, 20));

    audioCtx.close();

    onProgress(1.0, `Done. v = ${Math.abs(velocity).toFixed(1)} m/s · f₀ = ${baseFrequency.toFixed(1)} Hz · confidence = ${confidence.toFixed(0)}%`);

    return {
      velocity,
      velocityKmh: Math.abs(velocity) * 3.6,
      baseFrequency,
      fApproach,
      fRecede,
      confidence,
      smoothedFreqs: smoothed,
      activeTimes,
      activeMags,
      peakIdx,
      monoSamples: mono,
      sampleRate: sr
    };
  }
}
