# Doppler Synthesizer & Detector — Angular

Angular 17 conversion of the Doppler Synthesizer & Detector app.

## Project Structure

```
src/
├── main.ts                          # Bootstrap entry point
├── index.html
├── styles.css                       # Global styles (identical to original)
└── app/
    ├── app.component.ts             # Root component (hosts both sections)
    ├── services/
    │   ├── generator.service.ts     # All synthesis logic (injectable)
    │   └── detector.service.ts      # All analysis logic (injectable)
    ├── generator/
    │   ├── generator.component.ts   # Part I: Doppler Synthesizer
    │   └── generator.component.html
    └── detector/
        ├── detector.component.ts    # Part II: Velocity Detector
        └── detector.component.html
```

## Services (for team integration)

### `GeneratorService`
Inject via DI and call:
```ts
constructor(private genSvc: GeneratorService) {}

const result = await this.genSvc.generate(params, (progress, msg) => { ... });
// result: { samples, wavData, audioBuffer, durationSec, wavSizeKb }

const source = this.genSvc.play(result.audioBuffer);
this.genSvc.stop(source);
this.genSvc.downloadWAV(result.wavData);
```

### `DetectorService`
Inject via DI and call:
```ts
constructor(private detSvc: DetectorService) {}

const result = await this.detSvc.analyse(file, (progress, msg) => { ... });
// result: { velocity, velocityKmh, baseFrequency, fApproach, fRecede,
//           confidence, smoothedFreqs, activeTimes, monoSamples, ... }
```

## Setup & Run

```bash
npm install
npm start       # → http://localhost:4200
npm run build   # production build → dist/
```

## Dependencies
- Angular 17 (standalone components, no NgModule needed)
- `chart.js` ^4.4.1
- `@angular/forms` for `ngModel` on sliders/selects
