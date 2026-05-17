import { Component, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables, TooltipItem } from 'chart.js';
import { DetectorService, DetectorResult } from '../../../services/detector.service';

Chart.register(...registerables);

@Component({
  selector: 'app-detector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detector.component.html',
  styleUrls: ['./detector.component.css']
})
export class DetectorComponent implements OnDestroy {
  @ViewChild('detAmpCanvas')  detAmpCanvas!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('detFreqCanvas') detFreqCanvas!: ElementRef<HTMLCanvasElement>;

  isDragOver   = false;
  uploadedFile: File | null = null;
  fileName     = '';
  audioSrc     = '';
  analysing    = false;
  canAnalyse   = false;
  showResults  = false;
  showAmpChart = false;
  showFreqChart= false;

  statusMsg   = 'Upload an audio file to begin…';
  statusClass = '';
  progress    = 0;

  resVelocity    = '—'; resVelocityKmh = '—'; resBaseFreq = '—';
  resApproach    = '—'; resRecede = '—'; resConf = '—'; confBarWidth = '0%';

  private ampChart:  Chart | null = null;
  private freqChart: Chart | null = null;

  constructor(private detSvc: DetectorService) {}

  ngOnDestroy(): void { this.ampChart?.destroy(); this.freqChart?.destroy(); }

  onDragOver(e: DragEvent): void { e.preventDefault(); this.isDragOver = true; }
  onDragLeave(): void { this.isDragOver = false; }
  onDrop(e: DragEvent): void { e.preventDefault(); this.isDragOver = false; const f = e.dataTransfer?.files[0]; if (f) this.handleFile(f); }
  onFileChange(e: Event): void { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.handleFile(f); }

  private handleFile(f: File): void {
    if (!f.type.startsWith('audio/')) { this.setStatus('Please upload an audio file (.wav, .mp3, etc.)', 'error'); return; }
    this.uploadedFile = f; this.fileName = `✓ ${f.name}`; this.audioSrc = URL.createObjectURL(f);
    this.canAnalyse = true; this.setStatus(`Loaded: ${f.name} (${(f.size / 1024).toFixed(0)} KB)`, 'active');
  }

  private setStatus(msg: string, cls = ''): void { this.statusMsg = msg; this.statusClass = cls; }
  private setProgress(p: number): void { this.progress = p * 100; }

  async analyse(): Promise<void> {
    if (!this.uploadedFile) return;
    this.analysing = true; this.showResults = false; this.showAmpChart = false; this.showFreqChart = false;
    try {
      const result: DetectorResult = await this.detSvc.analyse(this.uploadedFile, (p, msg) => { this.setProgress(p); this.setStatus(msg, 'active'); });
      this.populateResults(result);
      setTimeout(() => {
        this.showAmpChart = true; this.showFreqChart = true;
        setTimeout(() => { this.drawAmpChart(result); this.drawFreqChart(result); }, 50);
      }, 0);
    } catch (err: any) {
      this.setStatus('Error: ' + err.message, 'error');
    } finally {
      this.analysing = false; setTimeout(() => this.setProgress(0), 800);
    }
  }

  private populateResults(r: DetectorResult): void {
    this.resVelocity    = Math.abs(r.velocity).toFixed(2);
    this.resVelocityKmh = r.velocityKmh.toFixed(1);
    this.resBaseFreq    = r.baseFrequency.toFixed(1);
    this.resApproach    = r.fApproach.toFixed(1);
    this.resRecede      = r.fRecede.toFixed(1);
    this.resConf        = r.confidence.toFixed(0) + '%';
    this.confBarWidth   = r.confidence + '%';
    this.showResults    = true;
  }

  private drawAmpChart(r: DetectorResult): void {
    this.ampChart?.destroy();
    const mono = r.monoSamples, sr = r.sampleRate;
    const stride = Math.max(1, Math.floor(mono.length / 2000));
    const labels: string[] = [], data: number[] = [];
    for (let i = 0; i < mono.length; i += stride) { labels.push((i / sr).toFixed(3)); data.push(mono[i]); }
    const ctx = this.detAmpCanvas.nativeElement.getContext('2d')!;
    this.ampChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: 'rgba(99,179,237,0.75)', borderWidth: 1, pointRadius: 0, fill: true, backgroundColor: 'rgba(99,179,237,0.06)', tension: 0 }] },
      options: { responsive: true, animation: { duration: 400 }, plugins: { legend: { display: false } }, elements: { point: { radius: 0 } },
        scales: {
          x: { title: { display: true, text: 'Time (s)', color: '#718096', font: { family: 'Space Mono', size: 10 } }, ticks: { color: '#718096', font: { family: 'Space Mono', size: 10 }, maxTicksLimit: 10 }, grid: { color: 'rgba(99,179,237,0.04)' } },
          y: { min: -1.05, max: 1.05, title: { display: true, text: 'Amplitude', color: '#718096', font: { family: 'Space Mono', size: 10 } }, ticks: { color: '#718096', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(99,179,237,0.04)' } }
        }
      }
    });
  }

  private drawFreqChart(r: DetectorResult): void {
    this.freqChart?.destroy();
    const ptColors = r.smoothedFreqs.map((_, i) => i <= r.peakIdx ? 'rgba(246,173,85,0.85)' : 'rgba(99,179,237,0.85)');
    const ctx = this.detFreqCanvas.nativeElement.getContext('2d')!;
    this.freqChart = new Chart(ctx, {
      type: 'line',
      data: { labels: r.activeTimes, datasets: [
        { label: 'Frequency Track', data: r.smoothedFreqs, borderColor: 'rgba(99,179,237,0.5)', borderWidth: 1.5, pointBackgroundColor: ptColors, pointRadius: 4, pointHoverRadius: 6, fill: false, tension: 0.3 },
        { label: `f_approach = ${r.fApproach.toFixed(1)} Hz`, data: Array(r.smoothedFreqs.length).fill(r.fApproach), borderColor: 'rgba(246,173,85,0.5)', borderWidth: 1, borderDash: [6,4], pointRadius: 0, fill: false },
        { label: `f_recede = ${r.fRecede.toFixed(1)} Hz`, data: Array(r.smoothedFreqs.length).fill(r.fRecede), borderColor: 'rgba(99,179,237,0.4)', borderWidth: 1, borderDash: [6,4], pointRadius: 0, fill: false }
      ]},
      options: { responsive: true, animation: { duration: 500 },
        plugins: { legend: { display: true, labels: { color: '#718096', font: { family: 'Space Mono', size: 10 }, boxWidth: 20 } }, tooltip: { callbacks: { label: (ctx: TooltipItem<'line'>) => `${ctx.dataset.label}: ${typeof ctx.raw === 'number' ? (ctx.raw as number).toFixed(1) : ctx.raw} Hz` } } },
        scales: {
          x: { title: { display: true, text: 'Time (s)', color: '#718096', font: { family: 'Space Mono', size: 10 } }, ticks: { color: '#718096', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(99,179,237,0.04)' } },
          y: { title: { display: true, text: 'Frequency (Hz)', color: '#718096', font: { family: 'Space Mono', size: 10 } }, ticks: { color: '#718096', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(99,179,237,0.04)' } }
        }
      }
    });
  }
}
