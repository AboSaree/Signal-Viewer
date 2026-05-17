import { Component, Output, EventEmitter, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  @Output() navigate = new EventEmitter<string>();
  @ViewChild('waveAnim', { static: true }) waveAnimRef!: ElementRef<SVGPolylineElement>;

  private animFrame = 0;
  private t = 0;

  ngOnInit() {
    this.animate();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animFrame);
  }

  private animate() {
    const el = this.waveAnimRef?.nativeElement;
    if (el) {
      const W = 700, H = 80, N = 120;
      const points: string[] = [];
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * W;
        const y = H / 2
          + Math.sin((i / N) * 4 * Math.PI + this.t) * 18
          + Math.sin((i / N) * 9 * Math.PI + this.t * 1.7) * 8
          + Math.sin((i / N) * 2.2 * Math.PI + this.t * 0.4) * 12;
        points.push(`${x},${y}`);
      }
      el.setAttribute('points', points.join(' '));
      this.t += 0.025;
    }
    this.animFrame = requestAnimationFrame(() => this.animate());
  }

  goTo(tab: string) {
    this.navigate.emit(tab);
  }
}
