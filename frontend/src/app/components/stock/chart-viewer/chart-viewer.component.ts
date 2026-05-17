import {
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit,
  EventEmitter,
  Output
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData as LWCLineData,
  HistogramData,
  ColorType,
  CrosshairMode,
  Time,
  BarData
} from 'lightweight-charts';
import {
  OHLCData,
  ChartConfig,
  CrosshairData,
  MarketSignal,
  LineData,
  ForecastResult,
  ForecastStatus
} from '../models/market-data.model';
import { IndicatorService } from '../services/indicator.service';
import { ForecastService } from '../services/forecast.service';

@Component({
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  selector: 'app-stock-chart-viewer',
  templateUrl: './chart-viewer.component.html',
  styleUrls: ['./chart-viewer.component.css']
})
export class StockChartViewerComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('rsiContainer') rsiContainer!: ElementRef<HTMLDivElement>;

  @Input() signal!: MarketSignal;
  @Input() config!: ChartConfig;
  @Output() crosshairUpdate = new EventEmitter<CrosshairData>();
  @Output() forecastStatusChange = new EventEmitter<ForecastStatus>();

  private chart: IChartApi | null = null;
  private rsiChart: IChartApi | null = null;
  private mainSeries: ISeriesApi<any> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private sma20Series: ISeriesApi<'Line'> | null = null;
  private sma50Series: ISeriesApi<'Line'> | null = null;
  private sma200Series: ISeriesApi<'Line'> | null = null;
  private rsiSeries: ISeriesApi<'Line'> | null = null;

  // Forecast series
  private forecastSeries: ISeriesApi<'Line'> | null = null;
  private forecastUpperSeries: ISeriesApi<'Line'> | null = null;
  private forecastLowerSeries: ISeriesApi<'Line'> | null = null;

  private resizeObserver: ResizeObserver | null = null;

  processedData: OHLCData[] = [];
  sma20Data: LineData[] = [];
  sma50Data: LineData[] = [];
  sma200Data: LineData[] = [];
  rsiData: LineData[] = [];

  // Forecast data
  forecastData: ForecastResult | null = null;
  forecastStatus: ForecastStatus = 'idle';

  private lastBarCrosshair: CrosshairData | null = null;

  constructor(
    private indicatorService: IndicatorService,
    private forecastService: ForecastService
  ) { }

  ngOnInit(): void { }

  ngAfterViewInit(): void {
    this.initChart();
    this.updateChart();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.chart && this.chartContainer) {
        const width = this.chartContainer.nativeElement.clientWidth;
        this.chart.applyOptions({ width });
      }
      if (this.rsiChart && this.rsiContainer) {
        const width = this.rsiContainer.nativeElement.clientWidth;
        this.rsiChart.applyOptions({ width });
      }
    });

    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.chart && (changes['signal'] || changes['config'])) {
      // If only forecast toggle changed, handle separately
      if (changes['config'] && !changes['signal']) {
        const prev = changes['config'].previousValue as ChartConfig;
        const curr = changes['config'].currentValue as ChartConfig;

        if (prev && prev.showForecast !== curr.showForecast) {
          if (curr.showForecast) {
            this.runForecast();
          } else {
            this.removeForecastSeries();
            this.forecastData = null;
            this.forecastStatus = 'idle';
            this.forecastStatusChange.emit('idle');
          }
          // Still update the rest of the chart
          if (this.onlyForecastChanged(prev, curr)) {
            return;
          }
        }

        if (prev && prev.forecastDays !== curr.forecastDays && curr.showForecast) {
          this.runForecast();
          if (this.onlyForecastDaysChanged(prev, curr)) {
            return;
          }
        }
      }

      this.updateChart();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.remove();
    this.rsiChart?.remove();
  }

  private onlyForecastChanged(prev: ChartConfig, curr: ChartConfig): boolean {
    return prev.chartType === curr.chartType &&
      prev.timePeriod === curr.timePeriod &&
      prev.showSMA20 === curr.showSMA20 &&
      prev.showSMA50 === curr.showSMA50 &&
      prev.showSMA200 === curr.showSMA200 &&
      prev.showVolume === curr.showVolume &&
      prev.showRSI === curr.showRSI &&
      prev.forecastDays === curr.forecastDays;
  }

  private onlyForecastDaysChanged(prev: ChartConfig, curr: ChartConfig): boolean {
    return prev.chartType === curr.chartType &&
      prev.timePeriod === curr.timePeriod &&
      prev.showSMA20 === curr.showSMA20 &&
      prev.showSMA50 === curr.showSMA50 &&
      prev.showSMA200 === curr.showSMA200 &&
      prev.showVolume === curr.showVolume &&
      prev.showRSI === curr.showRSI &&
      prev.showForecast === curr.showForecast;
  }

  private initChart(): void {
    const container = this.chartContainer.nativeElement;
    const rsiContainer = this.rsiContainer?.nativeElement;

    this.chart = createChart(container, {
      width: container.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#0d0d19' },
        textColor: '#888',
        fontSize: 12
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#4a9eff44',
          width: 1,
          style: 3,
          labelBackgroundColor: '#4a9eff'
        },
        horzLine: {
          color: '#4a9eff44',
          width: 1,
          style: 3,
          labelBackgroundColor: '#4a9eff'
        }
      },
      rightPriceScale: {
        borderColor: '#2a2a3e',
        scaleMargins: { top: 0.1, bottom: 0.25 }
      },
      timeScale: {
        borderColor: '#2a2a3e',
        timeVisible: true,
        secondsVisible: false
      },
      handleScroll: { vertTouchDrag: false },
      localization: {
        locale: 'en-US',
        dateFormat: 'yyyy-MM-dd'
      }
    });

    // Crosshair handler
    this.chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData || !this.mainSeries) {
        if (this.lastBarCrosshair) {
          this.crosshairUpdate.emit(this.lastBarCrosshair);
        }
        return;
      }

      const mainData = param.seriesData.get(this.mainSeries) as any;
      if (!mainData) {
        // Check if hovering over forecast area
        if (this.forecastSeries && this.forecastData) {
          const forecastPoint = param.seriesData.get(this.forecastSeries) as any;
          if (forecastPoint) {
            const time = param.time as string;
            const forecastVal = this.forecastData.predictions.find(d => d.time === time)?.value;
            if (forecastVal) {
              const lastBar = this.processedData[this.processedData.length - 1];
              this.crosshairUpdate.emit({
                time,
                open: forecastVal,
                high: forecastVal,
                low: forecastVal,
                close: forecastVal,
                volume: 0,
                change: forecastVal - lastBar.close,
                changePercent: ((forecastVal - lastBar.close) / lastBar.close) * 100,
                forecast: forecastVal
              });
              return;
            }
          }
        }

        if (this.lastBarCrosshair) {
          this.crosshairUpdate.emit(this.lastBarCrosshair);
        }
        return;
      }

      const time = param.time as string;
      const ohlc = this.processedData.find(d => d.time === time);

      if (ohlc) {
        const crosshair = this.buildCrosshairData(ohlc, time);
        this.crosshairUpdate.emit(crosshair);
      }
    });

    // RSI Chart
    if (rsiContainer) {
      this.rsiChart = createChart(rsiContainer, {
        width: rsiContainer.clientWidth,
        height: 150,
        layout: {
          background: { type: ColorType.Solid, color: '#0d0d19' },
          textColor: '#888',
          fontSize: 11
        },
        grid: {
          vertLines: { color: '#1a1a2e' },
          horzLines: { color: '#1a1a2e' }
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: '#4a9eff44', width: 1, style: 3, labelBackgroundColor: '#4a9eff' },
          horzLine: { color: '#4a9eff44', width: 1, style: 3, labelBackgroundColor: '#4a9eff' }
        },
        rightPriceScale: {
          borderColor: '#2a2a3e',
          scaleMargins: { top: 0.1, bottom: 0.1 }
        },
        timeScale: { borderColor: '#2a2a3e', visible: true },
        handleScroll: { vertTouchDrag: false },
        localization: { locale: 'en-US', dateFormat: 'yyyy-MM-dd' }
      });
    }

    this.syncCharts();
  }

  private buildCrosshairData(ohlc: OHLCData, time: string): CrosshairData {
    const idx = this.processedData.indexOf(ohlc);
    const prevIdx = idx - 1;
    const prevClose = prevIdx >= 0 ? this.processedData[prevIdx].close : ohlc.open;
    const change = ohlc.close - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    const forecastVal = this.forecastData?.predictions.find(d => d.time === time)?.value;

    return {
      time,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
      volume: ohlc.volume || 0,
      change,
      changePercent,
      sma20: this.sma20Data.find(d => d.time === time)?.value,
      sma50: this.sma50Data.find(d => d.time === time)?.value,
      sma200: this.sma200Data.find(d => d.time === time)?.value,
      rsi: this.rsiData.find(d => d.time === time)?.value,
      forecast: forecastVal
    };
  }

  private emitLastBarData(): void {
    if (this.processedData.length === 0) return;
    const lastBar = this.processedData[this.processedData.length - 1];
    this.lastBarCrosshair = this.buildCrosshairData(lastBar, lastBar.time);
    this.crosshairUpdate.emit(this.lastBarCrosshair);
  }

  private syncCharts(): void {
    if (!this.chart || !this.rsiChart) return;

    this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && this.rsiChart) {
        this.rsiChart.timeScale().setVisibleLogicalRange(range);
      }
    });

    this.rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && this.chart) {
        this.chart.timeScale().setVisibleLogicalRange(range);
      }
    });
  }

  private updateChart(): void {
    if (!this.chart || !this.signal) return;

    this.removeSeries();
    this.processedData = this.getProcessedData();
    this.calculateIndicators();
    this.addMainSeries();

    if (this.config.showVolume) this.addVolumeSeries();
    if (this.config.showSMA20) this.addSMASeries(20, '#e91e63', 'sma20');
    if (this.config.showSMA50) this.addSMASeries(50, '#ff9800', 'sma50');
    if (this.config.showSMA200) this.addSMASeries(200, '#9c27b0', 'sma200');

    this.updateRSI();

    // Run forecast if enabled
    if (this.config.showForecast) {
      this.runForecast();
    }

    this.chart.timeScale().fitContent();
    this.rsiChart?.timeScale().fitContent();
    this.emitLastBarData();
  }

  /**
   * Run the LSTM forecast
   */
  async runForecast(): Promise<void> {
    if (!this.chart || !this.signal || this.processedData.length === 0) return;

    this.forecastStatus = 'loading';
    this.forecastStatusChange.emit('loading');

    // Remove old forecast
    this.removeForecastSeries();

    try {
      const result = await this.forecastService.predict(
        this.processedData,
        this.config.forecastDays
      );

      this.forecastData = result;
      this.forecastStatus = 'success';
      this.forecastStatusChange.emit('success');

      this.addForecastSeries(result);

      // Fit content to include forecast
      this.chart?.timeScale().fitContent();

    } catch (error: any) {
      console.error('Forecast failed:', error);
      this.forecastStatus = 'error';
      this.forecastStatusChange.emit('error');
    }
  }

  /**
   * Add forecast lines to the chart
   */
  private addForecastSeries(result: ForecastResult): void {
    if (!this.chart) return;

    // Upper confidence band (semi-transparent)
    this.forecastUpperSeries = this.chart.addLineSeries({
      color: 'rgba(0, 230, 255, 0.15)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.forecastUpperSeries.setData(
      result.upperBand.map(d => ({ time: d.time as Time, value: d.value })) as LWCLineData[]
    );

    // Lower confidence band (semi-transparent)
    this.forecastLowerSeries = this.chart.addLineSeries({
      color: 'rgba(0, 230, 255, 0.15)',
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false
    });
    this.forecastLowerSeries.setData(
      result.lowerBand.map(d => ({ time: d.time as Time, value: d.value })) as LWCLineData[]
    );

    // Main forecast line
    this.forecastSeries = this.chart.addLineSeries({
      color: '#00e6ff',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: '#00e6ff',
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: '#00e6ff',
      priceLineStyle: 2,
      title: 'LSTM Forecast'
    });
    this.forecastSeries.setData(
      result.predictions.map(d => ({ time: d.time as Time, value: d.value })) as LWCLineData[]
    );

    // Add a marker at the forecast start
    if (result.predictions.length > 0) {
      this.forecastSeries.setMarkers([
        {
          time: result.predictions[0].time as Time,
          position: 'inBar',
          color: '#00e6ff',
          shape: 'circle',
          text: 'Forecast Start'
        }
      ]);
    }
  }

  /**
   * Remove forecast series from chart
   */
  private removeForecastSeries(): void {
    if (!this.chart) return;
    try {
      if (this.forecastSeries) { this.chart.removeSeries(this.forecastSeries); this.forecastSeries = null; }
      if (this.forecastUpperSeries) { this.chart.removeSeries(this.forecastUpperSeries); this.forecastUpperSeries = null; }
      if (this.forecastLowerSeries) { this.chart.removeSeries(this.forecastLowerSeries); this.forecastLowerSeries = null; }
    } catch (e) { }
  }

  private getProcessedData(): OHLCData[] {
    let data = [...this.signal.data];
    if (this.config.timePeriod === 'W') {
      data = this.indicatorService.aggregateByPeriod(data, 'W');
    } else if (this.config.timePeriod === 'M') {
      data = this.indicatorService.aggregateByPeriod(data, 'M');
    }
    if (this.config.chartType === 'HeikinAshi') {
      data = this.indicatorService.toHeikinAshi(data);
    }
    return data;
  }

  private calculateIndicators(): void {
    const rawData = this.config.timePeriod === 'W'
      ? this.indicatorService.aggregateByPeriod(this.signal.data, 'W')
      : this.config.timePeriod === 'M'
        ? this.indicatorService.aggregateByPeriod(this.signal.data, 'M')
        : this.signal.data;

    this.sma20Data = this.indicatorService.calculateSMA(rawData, 20);
    this.sma50Data = this.indicatorService.calculateSMA(rawData, 50);
    this.sma200Data = this.indicatorService.calculateSMA(rawData, 200);
    this.rsiData = this.indicatorService.calculateRSI(rawData, 14);
  }

  private removeSeries(): void {
    if (!this.chart) return;
    try {
      if (this.mainSeries) { this.chart.removeSeries(this.mainSeries); this.mainSeries = null; }
      if (this.volumeSeries) { this.chart.removeSeries(this.volumeSeries); this.volumeSeries = null; }
      if (this.sma20Series) { this.chart.removeSeries(this.sma20Series); this.sma20Series = null; }
      if (this.sma50Series) { this.chart.removeSeries(this.sma50Series); this.sma50Series = null; }
      if (this.sma200Series) { this.chart.removeSeries(this.sma200Series); this.sma200Series = null; }
    } catch (e) { }
    this.removeForecastSeries();
    try {
      if (this.rsiSeries && this.rsiChart) { this.rsiChart.removeSeries(this.rsiSeries); this.rsiSeries = null; }
    } catch (e) { }
  }

  private addMainSeries(): void {
    if (!this.chart) return;
    const data = this.processedData;

    switch (this.config.chartType) {
      case 'Candle':
      case 'HeikinAshi':
        this.mainSeries = this.chart.addCandlestickSeries({
          upColor: '#26a69a', downColor: '#ef5350',
          borderUpColor: '#26a69a', borderDownColor: '#ef5350',
          wickUpColor: '#26a69a', wickDownColor: '#ef5350'
        });
        this.mainSeries.setData(data.map(d => ({
          time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close
        })) as CandlestickData[]);
        break;

      case 'Line':
        this.mainSeries = this.chart.addLineSeries({
          color: '#4a9eff', lineWidth: 2,
          crosshairMarkerVisible: true, crosshairMarkerRadius: 4
        });
        this.mainSeries.setData(data.map(d => ({
          time: d.time as Time, value: d.close
        })) as LWCLineData[]);
        break;

      case 'OHLC':
        this.mainSeries = this.chart.addBarSeries({
          upColor: '#26a69a', downColor: '#ef5350', thinBars: false
        });
        this.mainSeries.setData(data.map(d => ({
          time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close
        })) as BarData[]);
        break;

      case 'HollowCandle':
        this.mainSeries = this.chart.addCandlestickSeries({
          upColor: 'transparent', downColor: '#ef5350',
          borderUpColor: '#26a69a', borderDownColor: '#ef5350',
          wickUpColor: '#26a69a', wickDownColor: '#ef5350'
        });
        this.mainSeries.setData(data.map(d => ({
          time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close
        })) as CandlestickData[]);
        break;
    }
  }

  private addVolumeSeries(): void {
    if (!this.chart) return;
    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: 'volume' }, priceScaleId: 'volume'
    });
    this.chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.volumeSeries.setData(this.processedData.map(d => ({
      time: d.time as Time, value: d.volume || 0,
      color: d.close >= d.open ? 'rgba(38, 166, 154, 0.3)' : 'rgba(239, 83, 80, 0.3)'
    })) as HistogramData[]);
  }

  private addSMASeries(period: number, color: string, field: 'sma20' | 'sma50' | 'sma200'): void {
    if (!this.chart) return;
    const smaData = field === 'sma20' ? this.sma20Data : field === 'sma50' ? this.sma50Data : this.sma200Data;
    const series = this.chart.addLineSeries({
      color, lineWidth: 1, crosshairMarkerVisible: false,
      lastValueVisible: true, priceLineVisible: false
    });
    series.setData(smaData.map(d => ({ time: d.time as Time, value: d.value })) as LWCLineData[]);
    switch (field) {
      case 'sma20': this.sma20Series = series; break;
      case 'sma50': this.sma50Series = series; break;
      case 'sma200': this.sma200Series = series; break;
    }
  }

  private updateRSI(): void {
    if (!this.rsiChart) return;
    try { if (this.rsiSeries) { this.rsiChart.removeSeries(this.rsiSeries); this.rsiSeries = null; } } catch (e) { }
    if (!this.config.showRSI || this.rsiData.length === 0) return;

    this.rsiSeries = this.rsiChart.addLineSeries({
      color: '#ff9800', lineWidth: 1, crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3, lastValueVisible: true
    });
    this.rsiSeries.setData(this.rsiData.map(d => ({ time: d.time as Time, value: d.value })) as LWCLineData[]);
    this.addRSILevels();
  }

  private addRSILevels(): void {
    if (!this.rsiSeries) return;
    this.rsiSeries.createPriceLine({ price: 70, color: '#ef5350', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    this.rsiSeries.createPriceLine({ price: 30, color: '#26a69a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
    this.rsiSeries.createPriceLine({ price: 50, color: '#555', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });
  }
}
