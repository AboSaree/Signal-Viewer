import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeneratorComponent } from './generator/generator.component';
import { DetectorComponent } from './detector/detector.component';

@Component({
  selector: 'app-doppler',
  standalone: true,
  imports: [CommonModule, GeneratorComponent, DetectorComponent],
  template: `
    <main class="dp-main">
      <app-generator></app-generator>
      <app-detector></app-detector>
    </main>
  `,
  styles: [`
    .dp-main {
      position: relative; z-index: 1;
      max-width: 1280px; margin: 0 auto;
      padding: 32px 28px 80px;
      display: flex; flex-direction: column; gap: 24px;
    }
    @media(max-width:640px){ .dp-main{ padding: 20px 16px 60px; } }
  `]
})
export class DopplerComponent {}
