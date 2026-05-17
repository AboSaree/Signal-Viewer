import { Component } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-drone-detector',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './drone-detector.component.html',
  styleUrls: ['./drone-detector.component.css']
})
export class DroneDetectorComponent {

  fileName: string = '';
  audioSrc: string = '';
  status: string = '';
  statusType: string = '';       // 'info' | 'active' | 'error'
  showPlayer: boolean = false;
  showStatus: boolean = false;
  showResult: boolean = false;
  showProgress: boolean = false;
  progress: number = 0;
  resultLabel: string = '—';
  resultSub: string = '';
  resultClass: string = '';      // 'detected' | 'not-detected'
  resultIcon: string = '—';
  isAnalyzeDisabled: boolean = true;
  isDragOver: boolean = false;

  private selectedFile: File | null = null;
  private progressInterval: any;

  constructor(private http: HttpClient) { }

  onZoneClick(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave() {
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFileSelect(files[0]);
    }
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFileSelect(input.files[0]);
    }
  }

  private handleFileSelect(file: File) {
    this.selectedFile = file;
    this.fileName = file.name;
    this.audioSrc = URL.createObjectURL(file);
    this.showPlayer = true;
    this.isAnalyzeDisabled = false;
    this.showResult = false;
    this.showStatus = false;
  }

  async uploadAudio() {
    if (!this.selectedFile) return;

    this.isAnalyzeDisabled = true;
    this.showResult = false;
    this.showProgress = true;
    this.setStatus('Analyzing audio signal...', 'info');

    const formData = new FormData();
    formData.append('audio', this.selectedFile);

    // Simulate progress
    this.progress = 0;
    this.progressInterval = setInterval(() => {
      if (this.progress < 90) {
        this.progress += Math.random() * 30;
        if (this.progress > 90) this.progress = 90;
      }
    }, 200);

    this.http.post<{ label: string; confidence: number; error?: string }>(
      'http://127.0.0.1:8000/drone/predict',
      formData
    ).subscribe({
      next: (data) => {
        clearInterval(this.progressInterval);
        this.progress = 100;

        if (data.error) {
          this.setStatus(`Error: ${data.error}`, 'error');
        } else {
          this.displayResult(data.label);
          this.setStatus('Classification complete.', 'active');
        }

        this.resetProgress();
      },
      error: () => {
        clearInterval(this.progressInterval);
        this.setStatus('Unable to connect to classification server.', 'error');
        this.resetProgress();
      }
    });
  }

  private displayResult(label: string) {
    const normalized = label.toLowerCase();
    const isDrone = normalized.includes('drone') || normalized === 'positive';

    this.resultLabel = label.toUpperCase();
    this.resultClass = isDrone ? 'detected' : 'not-detected';
    this.resultIcon = isDrone ? '🚁' : '✓';
    this.resultSub = isDrone
      ? 'Drone acoustic signature identified'
      : 'No drone signature detected in recording';
    this.showResult = true;
  }

  private setStatus(message: string, type: string) {
    this.status = message;
    this.statusType = type;
    this.showStatus = true;
  }

  private resetProgress() {
    setTimeout(() => {
      this.showProgress = false;
      this.progress = 0;
      this.isAnalyzeDisabled = false;
    }, 1500);
  }
}
