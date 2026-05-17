import { Component, AfterViewInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { GeneratorService, GeneratorParams, SAMPLE_RATE } from '../../../services/generator.service';

Chart.register(...registerables);

@Component({
  selector: 'app-generator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './generator.component.html',
  styleUrls: ['./generator.component.css']
})
export class GeneratorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('waveCanvas') waveCanvas!: ElementRef<HTMLCanvasElement>;

  frequency  = 440;
  velocity   = 30;
  duration   = 3;
  soundSpeed = 343;
  waveform: GeneratorParams['waveform'] = 'sine';

  statusMsg   = 'Awaiting parameters…';
  statusClass = '';
  progress    = 0;
  generating  = false;
  canPlay     = false;
  canDownload = false;

  private wavData:     ArrayBuffer | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private playSource:  AudioBufferSourceNode | null = null;
  private waveChart:   Chart | null = null;

  constructor(private genSvc: GeneratorService) {}

  ngAfterViewInit(): void { this.initChart(); }
  ngOnDestroy(): void { this.waveChart?.destroy(); }

  private initChart(): void {
    const ctx = this.waveCanvas.nativeElement.getContext('2d')!;
    this.waveChart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{ data: [], borderColor: 'rgba(246,173,85,0.85)', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(246,173,85,0.05)', tension: 0, pointRadius: 0 }] },
      options: {
        responsive: true, animation: false, plugins: { legend: { display: false } }, elements: { point: { radius: 0 } },
        scales: {
          x: { ticks: { color: '#718096', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(99,179,237,0.04)' } },
          y: { min: -1.1, max: 1.1, ticks: { color: '#718096', font: { family: 'Space Mono', size: 10 } }, grid: { color: 'rgba(99,179,237,0.04)' } }
        }
      }
    });
  }

  private setStatus(msg: string, cls = ''): void { this.statusMsg = msg; this.statusClass = cls; }
  private setProgress(p: number): void { this.progress = p * 100; }

  async generate(): Promise<void> {
    this.generating = true; this.canPlay = false; this.canDownload = false;
    const result = await this.genSvc.generate(
      { frequency: this.frequency, velocity: this.velocity, duration: this.duration, soundSpeed: this.soundSpeed, waveform: this.waveform },
      (p, msg) => { this.setProgress(p); this.setStatus(msg, 'active'); }
    );
    this.wavData = result.wavData; this.audioBuffer = result.audioBuffer;
    const filtered = result.samples;
    const stride = Math.max(1, Math.floor(filtered.length / 2000));
    const labels: string[] = [], data: number[] = [];
    for (let i = 0; i < filtered.length; i += stride) { labels.push((i / SAMPLE_RATE).toFixed(3)); data.push(filtered[i]); }
    if (this.waveChart) { this.waveChart.data.labels = labels; this.waveChart.data.datasets[0].data = data; this.waveChart.update(); }
    this.generating = false; this.canPlay = true; this.canDownload = true;
    setTimeout(() => this.setProgress(0), 800);
  }

  play(): void {
    if (!this.audioBuffer) return;
    this.genSvc.stop(this.playSource);
    this.playSource = this.genSvc.play(this.audioBuffer);
    this.setStatus('Playing…', 'active');
    this.playSource.onended = () => this.setStatus('Playback complete.');
  }

  download(): void { if (this.wavData) this.genSvc.downloadWAV(this.wavData); }

  get freqLabel() { return `${this.frequency} Hz`; }
  get velLabel()  { return `${this.velocity} m/s`; }
  get durLabel()  { return `${parseFloat(String(this.duration)).toFixed(1)} s`; }
  get sndLabel()  { return `${this.soundSpeed} m/s`; }
}
