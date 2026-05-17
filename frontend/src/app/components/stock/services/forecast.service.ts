// src/app/services/forecast.service.ts

import { Injectable } from '@angular/core';
import { OHLCData, LineData, ForecastResult } from '../models/market-data.model';
import * as tf from '@tensorflow/tfjs';

export interface TrainingProgress {
    epoch: number;
    totalEpochs: number;
    loss: number;
    phase: 'preparing' | 'training' | 'predicting' | 'done';
    message: string;
}

@Injectable({
    providedIn: 'root'
})
export class ForecastService {

    // ============ FAST Configuration ============
    private readonly LOOKBACK = 10;
    private readonly EPOCHS = 15;
    private readonly BATCH_SIZE = 32;
    private readonly LSTM_UNITS = 16;
    private readonly LEARNING_RATE = 0.005;
    private readonly MAX_SAMPLES = 200;

    // ============ Cached Model ============
    private currentModel: tf.LayersModel | null = null;
    private currentModelKey = '';

    // ============ GPU State ============
    private backendReady = false;
    private backendName = 'unknown';

    // ============ Progress ============
    private progressCallback: ((p: TrainingProgress) => void) | null = null;

    constructor() {
        this.initGPU();
    }

    /**
     * Force GPU (WebGL) backend. Falls back to WASM then CPU.
     */
    private async initGPU(): Promise<void> {
        try {
            // Try WebGL first (GPU)
            await tf.setBackend('webgl');
            await tf.ready();

            // Verify it actually activated
            this.backendName = tf.getBackend();

            if (this.backendName === 'webgl') {
                console.log('✅ TensorFlow.js using GPU (WebGL)');

                // Optimize WebGL settings for speed
                tf.env().set('WEBGL_CPU_FORWARD', false);
                tf.env().set('WEBGL_PACK', true);
                tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
                tf.env().set('WEBGL_RENDER_FLOAT32_CAPABLE', true);
                tf.env().set('WEBGL_FLUSH_THRESHOLD', -1);

            } else {
                console.warn(`⚠️ WebGL not available, using: ${this.backendName}`);
            }

            this.backendReady = true;

        } catch (webglErr) {
            console.warn('WebGL failed:', webglErr);

            try {
                // Try WASM backend (faster than CPU)
                await tf.setBackend('wasm');
                await tf.ready();
                this.backendName = tf.getBackend();
                console.log(`⚠️ Using WASM backend`);
                this.backendReady = true;

            } catch (wasmErr) {
                console.warn('WASM failed:', wasmErr);

                try {
                    // Last resort: CPU
                    await tf.setBackend('cpu');
                    await tf.ready();
                    this.backendName = tf.getBackend();
                    console.log(`⚠️ Using CPU backend (slowest)`);
                    this.backendReady = true;

                } catch (cpuErr) {
                    console.error('All backends failed:', cpuErr);
                    this.backendReady = false;
                }
            }
        }
    }

    /**
     * Wait until the GPU backend is ready
     */
    private async ensureBackend(): Promise<void> {
        if (this.backendReady) return;

        // Wait up to 5 seconds for backend
        for (let i = 0; i < 50; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (this.backendReady) return;
        }

        // Force CPU if nothing worked
        await tf.setBackend('cpu');
        await tf.ready();
        this.backendName = 'cpu';
        this.backendReady = true;
    }

    /**
     * Get the current backend name (for UI display)
     */
    getBackendName(): string {
        return this.backendName;
    }

    /**
     * Check if running on GPU
     */
    isGPU(): boolean {
        return this.backendName === 'webgl';
    }

    onProgress(cb: (p: TrainingProgress) => void): void {
        this.progressCallback = cb;
    }

    private emit(p: TrainingProgress): void {
        this.progressCallback?.(p);
    }

    disposeModel(): void {
        if (this.currentModel) {
            this.currentModel.dispose();
            this.currentModel = null;
            this.currentModelKey = '';
        }
    }

    // ============ Main Entry ============

    async predict(data: OHLCData[], forecastDays: number = 30): Promise<ForecastResult> {
        // Make sure GPU/backend is ready before anything
        await this.ensureBackend();

        const minRequired = this.LOOKBACK + 5;

        if (data.length < minRequired) {
            return this.statisticalFallback(data, forecastDays,
                `Need ${minRequired}+ data points. Got ${data.length}. Using statistical model.`);
        }

        try {
            return await this.runLSTM(data, forecastDays);
        } catch (err: any) {
            console.error('LSTM failed:', err);
            tf.disposeVariables();
            return this.statisticalFallback(data, forecastDays,
                `LSTM error: ${err.message}. Using statistical fallback.`);
        }
    }

    // ============ Fast LSTM Pipeline ============

    private async runLSTM(data: OHLCData[], forecastDays: number): Promise<ForecastResult> {

        const gpuLabel = this.isGPU() ? '(GPU)' : `(${this.backendName})`;

        this.emit({
            epoch: 0, totalEpochs: this.EPOCHS, loss: 0,
            phase: 'preparing',
            message: `Preparing data... ${gpuLabel}`
        });

        const closes = data.map(d => d.close);
        const sampled = this.downsample(closes, this.MAX_SAMPLES);
        const priceNorm = this.normalize(sampled);
        const { xs, ys } = this.buildSequences(priceNorm.normalized);

        // Check cache
        const key = `${data.length}_${closes[closes.length - 1].toFixed(2)}`;
        let model: tf.LayersModel;

        if (this.currentModel && this.currentModelKey === key) {
            model = this.currentModel;
            this.emit({
                epoch: this.EPOCHS, totalEpochs: this.EPOCHS, loss: 0,
                phase: 'predicting',
                message: `Using cached model ${gpuLabel}`
            });
        } else {
            this.disposeModel();
            model = this.buildFastModel();
            await this.train(model, xs, ys);
            this.currentModel = model;
            this.currentModelKey = key;
        }

        // Predict
        this.emit({
            epoch: this.EPOCHS, totalEpochs: this.EPOCHS, loss: 0,
            phase: 'predicting',
            message: `Generating forecast ${gpuLabel}...`
        });

        const fullNorm = this.normalize(closes);
        const predicted = await this.rollForward(model, fullNorm, forecastDays);

        xs.dispose();
        ys.dispose();

        const lastDate = data[data.length - 1].time;
        const futureDates = this.futureDates(lastDate, forecastDays);
        const confidence = this.calcConfidence(closes, predicted);

        this.emit({
            epoch: this.EPOCHS, totalEpochs: this.EPOCHS, loss: 0,
            phase: 'done',
            message: `Done — ${forecastDays} days predicted ${gpuLabel}`
        });

        return this.buildResult(data, predicted, futureDates, confidence, 'local-fallback');
    }

    // ============ FAST Model ============

    private buildFastModel(): tf.LayersModel {
        const model = tf.sequential();

        model.add(tf.layers.lstm({
            units: this.LSTM_UNITS,
            inputShape: [this.LOOKBACK, 1],
            returnSequences: false
        }));

        model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

        model.compile({
            optimizer: tf.train.adam(this.LEARNING_RATE),
            loss: 'meanSquaredError'
        });

        return model;
    }

    // ============ Training ============

    private buildSequences(prices: number[]): { xs: tf.Tensor3D; ys: tf.Tensor2D } {
        const xArr: number[][][] = [];
        const yArr: number[][] = [];

        for (let i = this.LOOKBACK; i < prices.length; i++) {
            const seq: number[][] = [];
            for (let j = i - this.LOOKBACK; j < i; j++) {
                seq.push([prices[j]]);
            }
            xArr.push(seq);
            yArr.push([prices[i]]);
        }

        return { xs: tf.tensor3d(xArr), ys: tf.tensor2d(yArr) };
    }

    private async train(model: tf.LayersModel, xs: tf.Tensor3D, ys: tf.Tensor2D): Promise<void> {
        let bestLoss = Infinity;
        const patience = 3;
        let noImprove = 0;
        const gpuLabel = this.isGPU() ? '(GPU)' : `(${this.backendName})`;

        await model.fit(xs, ys, {
            epochs: this.EPOCHS,
            batchSize: this.BATCH_SIZE,
            shuffle: true,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    const loss = logs ? logs['loss'] : 0;

                    this.emit({
                        epoch: epoch + 1,
                        totalEpochs: this.EPOCHS,
                        loss: loss || 0,
                        phase: 'training',
                        message: `Epoch ${epoch + 1}/${this.EPOCHS} — Loss: ${(loss || 0).toFixed(6)} ${gpuLabel}`
                    });

                    // Early stopping
                    if (loss && loss < bestLoss - 0.0001) {
                        bestLoss = loss;
                        noImprove = 0;
                    } else {
                        noImprove++;
                    }

                    if (noImprove >= patience) {
                        model.stopTraining = true;
                    }
                }
            }
        });
    }

    // ============ Prediction ============

    private async rollForward(
        model: tf.LayersModel,
        priceNorm: { normalized: number[]; min: number; max: number },
        days: number
    ): Promise<number[]> {
        const window = [...priceNorm.normalized.slice(-this.LOOKBACK)];
        const results: number[] = [];

        for (let i = 0; i < days; i++) {
            // Use tidy to auto-dispose intermediate tensors
            const val = tf.tidy(() => {
                const input = tf.tensor3d([window.map(v => [v])]);
                const output = model.predict(input) as tf.Tensor;
                return output.dataSync()[0]; // Sync is faster for single values
            });

            const clamped = Math.max(0, Math.min(1, val));
            const price = clamped * (priceNorm.max - priceNorm.min) + priceNorm.min;
            results.push(price);

            window.shift();
            window.push(clamped);
        }

        return results;
    }

    // ============ Downsample ============

    private downsample(prices: number[], maxSamples: number): number[] {
        if (prices.length <= maxSamples) return prices;

        const tail = prices.slice(-this.LOOKBACK);
        const head = prices.slice(0, -this.LOOKBACK);
        const step = Math.ceil(head.length / (maxSamples - this.LOOKBACK));
        const sampled: number[] = [];

        for (let i = 0; i < head.length; i += step) {
            sampled.push(head[i]);
        }

        return [...sampled, ...tail];
    }

    // ============ Statistical Fallback ============

    private statisticalFallback(
        data: OHLCData[],
        forecastDays: number,
        message: string
    ): ForecastResult {
        const closes = data.map(d => d.close);
        const last = closes[closes.length - 1];
        const lastDate = data[data.length - 1].time;

        const shortTrend = this.trend(closes.slice(-10));
        const longTrend = this.trend(closes.slice(-Math.min(50, closes.length)));
        const combined = shortTrend * 0.6 + longTrend * 0.4;

        const vol = this.volatility(closes.slice(-30));
        const sma = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
        const meanRev = (sma - last) / last * 0.1;
        const momentum = closes.length > 5
            ? (last - closes[closes.length - 6]) / closes[closes.length - 6] * 0.3 : 0;

        const dates = this.futureDates(lastDate, forecastDays);
        const predicted: number[] = [];
        let price = last;

        for (let i = 0; i < forecastDays; i++) {
            const decay = Math.exp(-i * 0.03);
            const change = price * (
                combined * decay +
                momentum * Math.exp(-i * 0.05) +
                meanRev * (1 - Math.exp(-i * 0.02))
            );
            const noise = (Math.random() - 0.5) * price * vol * 0.4 * Math.sqrt((i + 1) / forecastDays);
            price += change + noise;
            price = Math.max(price, last * 0.5);
            predicted.push(price);
        }

        return this.buildResult(data, predicted, dates, 0.45, 'local-fallback', message);
    }

    // ============ Helpers ============

    private normalize(vals: number[]): { normalized: number[]; min: number; max: number } {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const range = max - min || 1;
        return { normalized: vals.map(v => (v - min) / range), min, max };
    }

    private buildResult(
        data: OHLCData[],
        predicted: number[],
        dates: string[],
        confidence: number,
        source: 'huggingface' | 'local-fallback',
        message?: string
    ): ForecastResult {
        const last = data[data.length - 1];
        const vol = this.volatility(data.slice(-30).map(d => d.close));

        const predictions: LineData[] = [{ time: last.time, value: last.close }];
        const upper: LineData[] = [{ time: last.time, value: last.close }];
        const lower: LineData[] = [{ time: last.time, value: last.close }];

        for (let i = 0; i < predicted.length; i++) {
            const p = parseFloat(predicted[i].toFixed(2));
            const band = last.close * vol * Math.sqrt(i + 1) * 1.5;

            predictions.push({ time: dates[i], value: p });
            upper.push({ time: dates[i], value: parseFloat((p + band).toFixed(2)) });
            lower.push({ time: dates[i], value: parseFloat(Math.max(0.01, p - band).toFixed(2)) });
        }

        return { predictions, upperBand: upper, lowerBand: lower, confidence, modelSource: source, error: message };
    }

    private calcConfidence(prices: number[], predicted: number[]): number {
        let c = 0.6;
        if (prices.length > 200) c += 0.1;
        if (prices.length > 500) c += 0.05;
        const v = this.volatility(prices.slice(-30));
        if (v < 0.02) c += 0.1;
        if (v > 0.05) c -= 0.1;
        const last = prices[prices.length - 1];
        const range = (Math.max(...predicted) - Math.min(...predicted)) / last;
        if (range < 0.3) c += 0.05;
        if (range > 0.5) c -= 0.1;
        return Math.max(0.3, Math.min(0.9, c));
    }

    private trend(prices: number[]): number {
        if (prices.length < 2) return 0;
        const n = prices.length;
        let sx = 0, sy = 0, sxy = 0, sx2 = 0;
        for (let i = 0; i < n; i++) { sx += i; sy += prices[i]; sxy += i * prices[i]; sx2 += i * i; }
        const d = n * sx2 - sx * sx;
        if (d === 0) return 0;
        const slope = (n * sxy - sx * sy) / d;
        const avg = sy / n;
        return avg ? slope / avg : 0;
    }

    private volatility(prices: number[]): number {
        if (prices.length < 2) return 0.02;
        const r: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i - 1]) r.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        if (!r.length) return 0.02;
        const m = r.reduce((a, b) => a + b, 0) / r.length;
        return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length);
    }

    private futureDates(lastDate: string, count: number): string[] {
        const dates: string[] = [];
        const d = new Date(lastDate + 'T00:00:00');
        let added = 0;
        while (added < count) {
            d.setDate(d.getDate() + 1);
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${day}`);
            added++;
        }
        return dates;
    }
}