import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HomeComponent } from './components/home/home.component';
import { SignalViewerComponent } from './components/signal-viewer/signal-viewer.component';
import { DopplerComponent } from './components/doppler/doppler.component';
import { DroneDetectorComponent } from './components/drone-detector/drone-detector.component';
import { StockComponent } from './components/stock/stock.component';
import { Microbiome } from './components/microbio/microbiome.component';

export type Tab = 'home' | 'signal' | 'doppler' | 'drone' | 'stock' | 'microbio';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HomeComponent, SignalViewerComponent, DopplerComponent, DroneDetectorComponent, StockComponent, Microbiome],
  template: `
    <!-- ═══ HEADER / NAVBAR ═══ -->
    <header class="sv-header">
      <div class="sv-logo" (click)="setTab('home')" style="cursor:pointer">
        <div class="sv-logo-mark">
          <svg viewBox="0 0 20 20" fill="none" stroke="var(--cyan)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1,10 4,10 6,3 9,17 12,7 15,13 17,10 19,10"/>
          </svg>
        </div>
        <div>
          <div class="sv-logo-name">BIOSIG PLATFORM</div>
          <div class="sv-logo-version">SIGNAL · DOPPLER · DRONE · MARKET · BIO</div>
        </div>
      </div>

      <nav class="sv-nav">
        <button class="sv-nav-btn" [class.active]="activeTab === 'home'" (click)="setTab('home')">
          <span class="nav-pip"></span>HOME
        </button>
        <button class="sv-nav-btn" [class.active]="activeTab === 'signal'" (click)="setTab('signal')">
          <span class="nav-pip"></span>SIGNAL VIEWER
        </button>
        <button class="sv-nav-btn" [class.active]="activeTab === 'doppler'" (click)="setTab('doppler')">
          <span class="nav-pip"></span>DOPPLER
        </button>
        <button class="sv-nav-btn" [class.active]="activeTab === 'drone'" (click)="setTab('drone')">
          <span class="nav-pip"></span>DRONE DETECTOR
        </button>
        <button class="sv-nav-btn" [class.active]="activeTab === 'stock'" (click)="setTab('stock')">
          <span class="nav-pip"></span>MARKET SIGNALS
        </button>
        <button class="sv-nav-btn" [class.active]="activeTab === 'microbio'" (click)="setTab('microbio')">
          <span class="nav-pip"></span>MICROBIOME
        </button>
      </nav>

      <div class="sv-header-right">
        <div class="sv-pill">
          <div class="sv-pill-dot" [class.live]="statusLive"></div>
          <span>{{ statusText }}</span>
        </div>
        <div class="sv-chip">{{ chipText }}</div>
      </div>
    </header>

    <!-- ═══ TAB PANELS ═══ -->
    <app-home      *ngIf="activeTab === 'home'"    (navigate)="setTab($event)"></app-home>
    <app-signal-viewer *ngIf="activeTab === 'signal'" (statusChange)="onStatusChange($event)"></app-signal-viewer>
    <app-doppler   *ngIf="activeTab === 'doppler'"></app-doppler>
    <app-drone-detector *ngIf="activeTab === 'drone'"></app-drone-detector>
    <app-stock          *ngIf="activeTab === 'stock'"></app-stock>
    <app-microbiome     *ngIf="activeTab === 'microbio'"></app-microbiome>
  `,
  styles: [`
    .sv-header {
      position: sticky; top: 0; z-index: 200;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 28px; height: 60px;
      background: rgba(3,5,10,.92);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(20px) saturate(180%);
    }
    .sv-logo { display: flex; align-items: center; gap: 12px; }
    .sv-logo-mark {
      width: 32px; height: 32px; border: 1px solid var(--border-accent);
      border-radius: var(--radius); display: flex; align-items: center;
      justify-content: center; background: var(--cyan-glow);
    }
    .sv-logo-mark svg { width: 20px; height: 20px; }
    .sv-logo-name { font-family: var(--font-display); font-size: 15px; font-weight: 800; letter-spacing: .08em; }
    .sv-logo-version { font-family: var(--font-mono); font-size: 9px; color: var(--text-2); letter-spacing: .08em; margin-top: 2px; }
    .sv-nav {
      display: flex; align-items: center; gap: 4px;
      position: absolute; left: 50%; transform: translateX(-50%);
    }
    .sv-nav-btn {
      display: flex; align-items: center; gap: 7px; padding: 6px 16px;
      font-family: var(--font-mono); font-size: 10px; letter-spacing: .1em;
      color: var(--text-2); background: transparent; border: 1px solid transparent;
      border-radius: var(--radius); cursor: pointer; transition: all var(--transition);
      text-transform: uppercase;
    }
    .sv-nav-btn:hover { color: var(--text-1); border-color: var(--border); background: rgba(255,255,255,.04); }
    .sv-nav-btn.active { color: var(--cyan); border-color: var(--border-accent); background: var(--cyan-glow); }
    .nav-pip { width: 5px; height: 5px; border-radius: 50%; background: var(--text-3); transition: all var(--transition); flex-shrink: 0; }
    .sv-nav-btn.active .nav-pip { background: var(--cyan); box-shadow: 0 0 8px var(--cyan); }
    .sv-header-right { display: flex; align-items: center; gap: 16px; }

    @media(max-width: 768px) {
      .sv-nav { position: static; transform: none; }
      .sv-header { flex-direction: column; height: auto; padding: 12px 16px; gap: 10px; }
    }
  `]
})
export class AppComponent {
  activeTab: Tab = 'home';
  statusLive = false;
  statusText = 'STANDBY';
  chipText = 'BIOSIG';

  setTab(tab: Tab | string) {
    this.activeTab = tab as Tab;
    const chips: Record<string, string> = { home: 'BIOSIG', signal: 'ECG · EEG', doppler: 'DOPPLER', drone: 'DRONE · RF', stock: 'MARKET · OHLC', microbio: 'IBD · MICROBIOME' };
    this.chipText = chips[tab] || 'BIOSIG';
    if (tab !== 'signal') {
      this.statusLive = false;
      this.statusText = 'STANDBY';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onStatusChange(evt: { live: boolean; text: string }) {
    this.statusLive = evt.live;
    this.statusText = evt.text;
  }
}
