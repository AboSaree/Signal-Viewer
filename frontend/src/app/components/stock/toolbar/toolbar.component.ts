// src/app/components/toolbar/toolbar.component.ts

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, TitleCasePipe, DecimalPipe } from '@angular/common';
import { ChartConfig, ChartType, TimePeriod, CrosshairData, ForecastStatus } from '../models/market-data.model';

@Component({
  standalone: true,
  imports: [CommonModule, TitleCasePipe, DecimalPipe],
  selector: 'app-stock-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class StockToolbarComponent {
  @Input() config!: ChartConfig;
  @Input() crosshairData: CrosshairData | null = null;
  @Input() signalName: string = '';
  @Input() signalCategory: string = '';
  @Input() companies: string[] = [];
  @Input() selectedCompany: string = '';
  @Input() forecastStatus: ForecastStatus = 'idle';

  @Output() configChange = new EventEmitter<ChartConfig>();
  @Output() goBack = new EventEmitter<void>();
  @Output() companyChange = new EventEmitter<string>();

  chartTypeDropdownOpen = false;
  indicatorDropdownOpen = false;
  companyDropdownOpen = false;
  forecastSettingsOpen = false;

  chartTypes: { value: ChartType; label: string; icon: string }[] = [
    { value: 'Candle', label: 'Candle', icon: '🕯️' },
    { value: 'Line', label: 'Line', icon: '📈' },
    { value: 'OHLC', label: 'OHLC', icon: '📊' },
    { value: 'HollowCandle', label: 'Hollow Candle', icon: '🕯' },
    { value: 'HeikinAshi', label: 'Heikin Ashi', icon: '🎌' }
  ];

  timePeriods: TimePeriod[] = ['1M', '3M', '5M', '15M', '30M', '1H', 'D', 'W', 'M'];

  forecastDayOptions = [7, 14, 30, 60, 90];

  setChartType(type: ChartType): void {
    this.config = { ...this.config, chartType: type };
    this.configChange.emit(this.config);
    this.chartTypeDropdownOpen = false;
  }

  setTimePeriod(period: TimePeriod): void {
    this.config = { ...this.config, timePeriod: period };
    this.configChange.emit(this.config);
  }

  selectCompany(company: string): void {
    this.companyDropdownOpen = false;
    this.companyChange.emit(company);
  }

  toggleIndicator(indicator: string): void {
    switch (indicator) {
      case 'sma20':
        this.config = { ...this.config, showSMA20: !this.config.showSMA20 };
        break;
      case 'sma50':
        this.config = { ...this.config, showSMA50: !this.config.showSMA50 };
        break;
      case 'sma200':
        this.config = { ...this.config, showSMA200: !this.config.showSMA200 };
        break;
      case 'volume':
        this.config = { ...this.config, showVolume: !this.config.showVolume };
        break;
      case 'rsi':
        this.config = { ...this.config, showRSI: !this.config.showRSI };
        break;
      case 'forecast':
        this.config = { ...this.config, showForecast: !this.config.showForecast };
        break;
    }
    this.configChange.emit(this.config);
  }

  setForecastDays(days: number): void {
    this.config = { ...this.config, forecastDays: days };
    this.configChange.emit(this.config);
    this.forecastSettingsOpen = false;
  }

  getChartTypeIcon(): string {
    return this.chartTypes.find(t => t.value === this.config.chartType)?.icon || '🕯️';
  }

  formatDateEnglish(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  formatVolume(vol: number): string {
    if (!vol) return '0';
    if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
    if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
    if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K';
    return vol.toString();
  }

  closeAllDropdowns(): void {
    this.chartTypeDropdownOpen = false;
    this.indicatorDropdownOpen = false;
    this.companyDropdownOpen = false;
    this.forecastSettingsOpen = false;
  }

  getActiveIndicatorCount(): number {
    let count = 0;
    if (this.config.showSMA20) count++;
    if (this.config.showSMA50) count++;
    if (this.config.showSMA200) count++;
    if (this.config.showVolume) count++;
    if (this.config.showRSI) count++;
    if (this.config.showForecast) count++;
    return count;
  }
}
