// src/app/app.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeneratorComponent } from './generator/generator.component';
import { DetectorComponent } from './detector/detector.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, GeneratorComponent, DetectorComponent],
  template: `
    <div class="scanlines"></div>
    <app-generator></app-generator>
    <app-detector></app-detector>
  `
})
export class AppComponent {}
