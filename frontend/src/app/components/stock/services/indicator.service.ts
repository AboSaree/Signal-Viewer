import { Injectable } from '@angular/core';
import { OHLCData, LineData } from '../models/market-data.model';

@Injectable({
    providedIn: 'root'
})
export class IndicatorService {

    /**
     * Calculate Simple Moving Average
     */
    calculateSMA(data: OHLCData[], period: number): LineData[] {
        const result: LineData[] = [];
        if (data.length < period) return result;

        for (let i = period - 1; i < data.length; i++) {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sum += data[j].close;
            }
            result.push({
                time: data[i].time,
                value: parseFloat((sum / period).toFixed(2))
            });
        }
        return result;
    }

    /**
     * Calculate Exponential Moving Average
     */
    calculateEMA(data: OHLCData[], period: number): LineData[] {
        const result: LineData[] = [];
        if (data.length < period) return result;

        const multiplier = 2 / (period + 1);

        // First EMA is SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i].close;
        }
        let ema = sum / period;
        result.push({ time: data[period - 1].time, value: parseFloat(ema.toFixed(2)) });

        for (let i = period; i < data.length; i++) {
            ema = (data[i].close - ema) * multiplier + ema;
            result.push({ time: data[i].time, value: parseFloat(ema.toFixed(2)) });
        }
        return result;
    }

    /**
     * Calculate RSI (Relative Strength Index)
     */
    calculateRSI(data: OHLCData[], period: number = 14): LineData[] {
        const result: LineData[] = [];
        if (data.length < period + 1) return result;

        const gains: number[] = [];
        const losses: number[] = [];

        for (let i = 1; i < data.length; i++) {
            const change = data[i].close - data[i - 1].close;
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }

        // First average gain/loss
        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        let rsi = 100 - (100 / (1 + rs));
        result.push({ time: data[period].time, value: parseFloat(rsi.toFixed(2)) });

        // Subsequent values using smoothed averages
        for (let i = period; i < gains.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi = 100 - (100 / (1 + rs));
            result.push({ time: data[i + 1].time, value: parseFloat(rsi.toFixed(2)) });
        }

        return result;
    }

    /**
     * Calculate MACD
     */
    calculateMACD(data: OHLCData[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): {
        macd: LineData[], signal: LineData[], histogram: LineData[]
    } {
        const fastEMA = this.calculateEMA(data, fastPeriod);
        const slowEMA = this.calculateEMA(data, slowPeriod);

        const macdLine: LineData[] = [];
        const slowMap = new Map(slowEMA.map(d => [d.time, d.value]));

        for (const fast of fastEMA) {
            const slowVal = slowMap.get(fast.time);
            if (slowVal !== undefined) {
                macdLine.push({
                    time: fast.time,
                    value: parseFloat((fast.value - slowVal).toFixed(4))
                });
            }
        }

        // Signal line (EMA of MACD)
        const signalLine: LineData[] = [];
        if (macdLine.length >= signalPeriod) {
            const multiplier = 2 / (signalPeriod + 1);
            let ema = macdLine.slice(0, signalPeriod).reduce((a, b) => a + b.value, 0) / signalPeriod;
            signalLine.push({ time: macdLine[signalPeriod - 1].time, value: parseFloat(ema.toFixed(4)) });

            for (let i = signalPeriod; i < macdLine.length; i++) {
                ema = (macdLine[i].value - ema) * multiplier + ema;
                signalLine.push({ time: macdLine[i].time, value: parseFloat(ema.toFixed(4)) });
            }
        }

        // Histogram
        const histogram: LineData[] = [];
        const signalMap = new Map(signalLine.map(d => [d.time, d.value]));
        for (const m of macdLine) {
            const s = signalMap.get(m.time);
            if (s !== undefined) {
                histogram.push({ time: m.time, value: parseFloat((m.value - s).toFixed(4)) });
            }
        }

        return { macd: macdLine, signal: signalLine, histogram };
    }

    /**
     * Convert OHLC data to Heikin Ashi
     */
    toHeikinAshi(data: OHLCData[]): OHLCData[] {
        if (data.length === 0) return [];

        const result: OHLCData[] = [];

        // First candle
        const first = data[0];
        const haClose0 = (first.open + first.high + first.low + first.close) / 4;
        const haOpen0 = (first.open + first.close) / 2;
        result.push({
            time: first.time,
            open: parseFloat(haOpen0.toFixed(2)),
            high: Math.max(first.high, haOpen0, haClose0),
            low: Math.min(first.low, haOpen0, haClose0),
            close: parseFloat(haClose0.toFixed(2)),
            volume: first.volume
        });

        for (let i = 1; i < data.length; i++) {
            const curr = data[i];
            const prev = result[i - 1];
            const haClose = (curr.open + curr.high + curr.low + curr.close) / 4;
            const haOpen = (prev.open + prev.close) / 2;
            const haHigh = Math.max(curr.high, haOpen, haClose);
            const haLow = Math.min(curr.low, haOpen, haClose);

            result.push({
                time: curr.time,
                open: parseFloat(haOpen.toFixed(2)),
                high: parseFloat(haHigh.toFixed(2)),
                low: parseFloat(haLow.toFixed(2)),
                close: parseFloat(haClose.toFixed(2)),
                volume: curr.volume
            });
        }

        return result;
    }

    /**
     * Aggregate data by time period (W = weekly, M = monthly)
     */
    aggregateByPeriod(data: OHLCData[], period: 'W' | 'M'): OHLCData[] {
        if (data.length === 0) return [];

        const groups: Map<string, OHLCData[]> = new Map();

        for (const bar of data) {
            const date = new Date(bar.time);
            let key: string;

            if (period === 'W') {
                // Group by week (Monday start)
                const dayOfWeek = date.getDay();
                const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                const monday = new Date(date);
                monday.setDate(diff);
                key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
            } else {
                // Group by month
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
            }

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(bar);
        }

        const result: OHLCData[] = [];
        groups.forEach((bars, key) => {
            const open = bars[0].open;
            const close = bars[bars.length - 1].close;
            const high = Math.max(...bars.map(b => b.high));
            const low = Math.min(...bars.map(b => b.low));
            const volume = bars.reduce((sum, b) => sum + (b.volume || 0), 0);

            result.push({ time: key, open, high, low, close, volume });
        });

        return result.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }
}
