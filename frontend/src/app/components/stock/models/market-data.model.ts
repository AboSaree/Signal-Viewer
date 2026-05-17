// src/app/models/market-data.model.ts

export interface OHLCData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LineData {
  time: string;
  value: number;
}

export interface MarketSignal {
  name: string;
  category: 'stock' | 'currency' | 'mineral';
  data: OHLCData[];
}

export interface MultiSignalFile {
  companies: string[];
  signals: MarketSignal[];
}

export type ChartType = 'Candle' | 'Line' | 'OHLC' | 'HollowCandle' | 'HeikinAshi';

export type TimePeriod = '1M' | '3M' | '5M' | '15M' | '30M' | '1H' | 'D' | 'W' | 'M';

export interface ChartConfig {
  chartType: ChartType;
  timePeriod: TimePeriod;
  showSMA20: boolean;
  showSMA50: boolean;
  showSMA200: boolean;
  showVolume: boolean;
  showRSI: boolean;
  showForecast: boolean;       // NEW
  forecastDays: number;         // NEW
}

export interface CrosshairData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
  rsi?: number;
  forecast?: number;            // NEW
}

export interface SMAData {
  period: number;
  color: string;
  data: LineData[];
}

/** Forecast result from the LSTM model */
export interface ForecastResult {
  predictions: LineData[];
  upperBand: LineData[];
  lowerBand: LineData[];
  confidence: number;
  modelSource: 'huggingface' | 'local-fallback';
  error?: string;
}

/** Forecast status for UI feedback */
export type ForecastStatus = 'idle' | 'loading' | 'success' | 'error';
