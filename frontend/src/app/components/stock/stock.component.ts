import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StockUploadComponent } from './upload/upload.component';
import { StockToolbarComponent } from './toolbar/toolbar.component';
import { StockChartViewerComponent } from './chart-viewer/chart-viewer.component';
import { StockRsiPanelComponent } from './rsi-panel/rsi-panel.component';
import {
  MarketSignal,
  MultiSignalFile,
  ChartConfig,
  CrosshairData,
  ForecastStatus
} from './models/market-data.model';

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule, StockUploadComponent, StockToolbarComponent, StockChartViewerComponent, StockRsiPanelComponent],
  template: `
    <div class="stock-tab">
      <!-- Upload Screen -->
      <div *ngIf="companies.length === 0">
        <app-stock-upload (fileLoaded)="onFileLoaded($event)"></app-stock-upload>
      </div>

      <!-- Chart Screen -->
      <div class="stock-chart-screen" *ngIf="currentSignal && companies.length > 0">
        <app-stock-toolbar
          [config]="chartConfig"
          [crosshairData]="crosshairData"
          [signalName]="currentSignal.name"
          [signalCategory]="currentSignal.category"
          [companies]="companies"
          [selectedCompany]="selectedCompany"
          [forecastStatus]="forecastStatus"
          (configChange)="onConfigChanged($event)"
          (companyChange)="selectCompany($event)"
          (goBack)="goBack()">
        </app-stock-toolbar>

        <app-stock-chart-viewer
          [signal]="currentSignal"
          [config]="chartConfig"
          (crosshairUpdate)="onCrosshairUpdate($event)"
          (forecastStatusChange)="onForecastStatusChange($event)">
        </app-stock-chart-viewer>

        <app-stock-rsi-panel
          *ngIf="chartConfig.showRSI"
          [rsiValue]="crosshairData?.rsi">
        </app-stock-rsi-panel>

        <!-- Footer -->
        <div class="stock-footer">
          <div class="stock-footer-left">
            <div class="stock-footer-item">
              <span class="stock-footer-label">Company</span>
              <span class="stock-footer-value stock-footer-company">{{ currentSignal.name }}</span>
            </div>
            <div class="stock-footer-item">
              <span class="stock-footer-label">Category</span>
              <span class="stock-footer-value" [attr.data-category]="currentSignal.category">
                {{ currentSignal.category | titlecase }}
              </span>
            </div>
            <div class="stock-footer-item">
              <span class="stock-footer-label">Data Points</span>
              <span class="stock-footer-value">{{ getSelectedDataPoints() }}</span>
            </div>
            <div class="stock-footer-item">
              <span class="stock-footer-label">Date Range</span>
              <span class="stock-footer-value">
                {{ formatDate(currentSignal.data[0]?.time) }} → {{ formatDate(currentSignal.data[currentSignal.data.length - 1]?.time) }}
              </span>
            </div>
            <div class="stock-footer-item" *ngIf="currentSignal.data.length > 0">
              <span class="stock-footer-label">Latest Close</span>
              <span class="stock-footer-value">{{ currentSignal.data[currentSignal.data.length - 1].close | number:'1.2-2' }}</span>
            </div>
          </div>
          <div class="stock-footer-right">
            <div class="stock-footer-item">
              <span class="stock-footer-label">Companies</span>
              <span class="stock-footer-value">{{ companies.length }}</span>
            </div>
            <div class="stock-footer-item">
              <span class="stock-footer-label">Total Rows</span>
              <span class="stock-footer-value">{{ getTotalDataPoints() }}</span>
            </div>
            <div class="stock-footer-item" *ngIf="chartConfig.showForecast">
              <span class="stock-footer-label">Forecast</span>
              <span class="stock-footer-value stock-footer-forecast" [ngClass]="forecastStatus">
                {{ forecastStatus === 'loading' ? '⏳ Running...' :
                   forecastStatus === 'success' ? '✅ ' + chartConfig.forecastDays + ' days' :
                   forecastStatus === 'error'   ? '❌ Failed' : '🤖 Ready' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .stock-tab {
      min-height: calc(100vh - 60px);
      background: var(--void);
      color: var(--text-1);
    }
    .stock-chart-screen {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 60px);
    }
    .stock-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: var(--panel-raised);
      border-top: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 12px;
      flex-shrink: 0;
    }
    .stock-footer-left, .stock-footer-right {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .stock-footer-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stock-footer-label {
      font-family: var(--font-mono);
      font-size: 9px;
      color: var(--text-2);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .stock-footer-value {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-1);
    }
    .stock-footer-company { color: var(--cyan); font-weight: 700; }
    .stock-footer-value[data-category="stock"]    { color: var(--green); }
    .stock-footer-value[data-category="currency"] { color: var(--cyan); }
    .stock-footer-value[data-category="mineral"]  { color: var(--amber); }
    .stock-footer-forecast.loading { color: var(--amber) !important; }
    .stock-footer-forecast.success { color: var(--green) !important; }
    .stock-footer-forecast.error   { color: var(--red) !important; }
  `]
})
export class StockComponent {
  allSignals: MarketSignal[] = [];
  companies: string[] = [];
  selectedCompany: string = '';
  currentSignal: MarketSignal | null = null;
  crosshairData: CrosshairData | null = null;
  forecastStatus: ForecastStatus = 'idle';

  chartConfig: ChartConfig = {
    chartType: 'Candle',
    timePeriod: 'M',
    showSMA20: false,
    showSMA50: false,
    showSMA200: false,
    showVolume: true,
    showRSI: false,
    showForecast: false,
    forecastDays: 30
  };

  onFileLoaded(result: MultiSignalFile): void {
    this.allSignals = result.signals;
    this.companies = result.companies;
    if (this.companies.length > 0) this.selectCompany(this.companies[0]);
  }

  selectCompany(name: string): void {
    this.selectedCompany = name;
    this.currentSignal = this.allSignals.find(s => s.name === name) || null;
    this.crosshairData = null;
    this.forecastStatus = 'idle';
  }

  onConfigChanged(config: ChartConfig): void { this.chartConfig = { ...config }; }
  onCrosshairUpdate(data: CrosshairData): void { this.crosshairData = data; }
  onForecastStatusChange(status: ForecastStatus): void { this.forecastStatus = status; }

  goBack(): void {
    this.allSignals = [];
    this.companies = [];
    this.selectedCompany = '';
    this.currentSignal = null;
    this.crosshairData = null;
    this.forecastStatus = 'idle';
  }

  getSelectedDataPoints(): number { return this.currentSignal?.data.length || 0; }
  getTotalDataPoints(): number { return this.allSignals.reduce((s, x) => s + x.data.length, 0); }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return dateStr; }
  }
}
