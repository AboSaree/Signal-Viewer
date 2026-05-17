import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MicrobiomeResult, WeekValue, BacteriumEntry,
  ParticipantInfo, SignalGraphConfig,
} from './models/microbiome.models';
import { CsvParserService } from './services/csv-parser.service';
import { MicrobiomeAnalysisService } from './services/microbiome-analysis.service';
import { SignalGraphComponent } from './components/signal-graph/signal-graph.component';
import { TaxonomicBarplotComponent } from './components/taxonomic-barplot/taxonomic-barplot.component';
import { DiversityHeatmapComponent } from './components/diversity-heatmap/diversity-heatmap.component';
import { PatientProfileComponent } from './components/patient-profile/patient-profile.component';

@Component({
  selector: 'app-microbiome',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    SignalGraphComponent, TaxonomicBarplotComponent,
    DiversityHeatmapComponent, PatientProfileComponent,
  ],
  templateUrl: './microbiome.component.html',
  styleUrls: ['./microbiome.component.css'],
})
export class Microbiome {

  /* ── Step 1: Upload ── */
  metadataFile: File | null = null;
  taxonomyFile: File | null = null;
  processing = false;
  uploadDone = false;
  uploadError: string | null = null;

  /* ── Step 2: Query ── */
  participants: ParticipantInfo[] = [];
  participantIndex: number | null = null;

  /* ── Step 3: Results ── */
  result: MicrobiomeResult | null = null;
  allResults: MicrobiomeResult[] = [];

  maxDI = 1;
  maxGoodValue = 1;
  maxBadValue = 1;

  dysbiosisConfig: SignalGraphConfig | null = null;
  goodBacteriaConfig: SignalGraphConfig | null = null;
  badBacteriaConfig: SignalGraphConfig | null = null;

  activeTab: 'signals' | 'barplot' | 'heatmap' | 'profile' = 'signals';

  constructor(
    private csvParser: CsvParserService,
    private analysis: MicrobiomeAnalysisService,
    private cdr: ChangeDetectorRef,
  ) {}

  /* ── File selection ── */
  onMetadataFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.metadataFile = input.files[0];
  }

  onTaxonomyFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.taxonomyFile = input.files[0];
  }

  /* ── Process files entirely client-side ── */
  async processDataset(): Promise<void> {
    if (!this.metadataFile || !this.taxonomyFile) return;

    this.processing = true;
    this.uploadError = null;

    try {
      // Parse CSVs
      const rawMeta = await this.csvParser.parseFile(this.metadataFile);
      const rawTax = await this.csvParser.parseFile(this.taxonomyFile);

      const metadata = this.csvParser.parseMetadata(rawMeta);
      const taxonomy = this.csvParser.parseTaxonomy(rawTax);

      console.log(`Parsed ${metadata.length} metadata rows, ${taxonomy.length} taxonomy rows`);

      if (metadata.length === 0) {
        throw new Error('No valid rows found in metadata CSV. Check column names (need sample_id, participant_id, diagnosis).');
      }
      if (taxonomy.length === 0) {
        throw new Error('No valid rows found in taxonomy CSV. Check that first column is sample_id.');
      }

      // Join and compute everything
      const { participants, results } = this.analysis.processDataset(metadata, taxonomy);

      if (results.length === 0) {
        throw new Error('No matching sample IDs between metadata and taxonomy files. Ensure sample_id values match.');
      }

      this.participants = participants;
      this.allResults = results;
      this.processing = false;
      this.uploadDone = true;

      console.log(`Processed ${results.length} participants`);
      this.cdr.detectChanges();

    } catch (err: any) {
      this.processing = false;
      this.uploadError = err.message || 'Failed to process files.';
      console.error('Processing error:', err);
      this.cdr.detectChanges();
    }
  }

  /* ── Select participant ── */
  selectParticipant(): void {
    if (this.participantIndex === null) return;

    const r = this.analysis.getResult(this.participantIndex);
    if (!r) {
      this.uploadError = 'Participant data not found.';
      return;
    }

    this.result = r;
    this.computeMaxValues(r);
    this.dysbiosisConfig = this.buildDysbiosisConfig();
    this.goodBacteriaConfig = this.buildGoodConfig();
    this.badBacteriaConfig = this.buildBadConfig();
    this.cdr.detectChanges();
  }

  /* ── Signal config builders ── */
  private baseConfig(): Omit<SignalGraphConfig, 'signals' | 'channels' | 'signalType' | 'selectedChannels' | 'timeWindow' | 'timeWindowSeconds'> {
    return {
      mode: 'time', fs: 1, currentIndex: 0,
      polarMode: 'fixed', reoccurrenceChX: 0, reoccurrenceChY: 1, reoccurrenceColorMap: 'Viridis',
    };
  }

  private emptyConfig(): SignalGraphConfig {
    return {
      ...this.baseConfig(), signals: [], channels: [], signalType: '',
      selectedChannels: [], timeWindow: 0, timeWindowSeconds: 0,
    };
  }

  private buildDysbiosisConfig(): SignalGraphConfig {
    if (!this.result) return this.emptyConfig();
    const signals = this.result.Dysbiosis_Index.map(d => [d.value]);
    return {
      ...this.baseConfig(), signals, channels: ['Dysbiosis Index'], signalType: 'Dysbiosis',
      selectedChannels: [true], timeWindow: signals.length, timeWindowSeconds: signals.length,
    };
  }

  private buildGoodConfig(): SignalGraphConfig {
    if (!this.result?.Good_Bacteria.length) return this.emptyConfig();
    const signals = this.buildMatrix(this.result.Good_Bacteria);
    return {
      ...this.baseConfig(), signals,
      channels: this.result.Good_Bacteria.map(b => b.name),
      signalType: 'Good Bacteria',
      selectedChannels: this.result.Good_Bacteria.map(() => true),
      timeWindow: signals.length, timeWindowSeconds: signals.length,
    };
  }

  private buildBadConfig(): SignalGraphConfig {
    if (!this.result?.Bad_Bacteria.length) return this.emptyConfig();
    const signals = this.buildMatrix(this.result.Bad_Bacteria);
    return {
      ...this.baseConfig(), signals,
      channels: this.result.Bad_Bacteria.map(b => b.name),
      signalType: 'Bad Bacteria',
      selectedChannels: this.result.Bad_Bacteria.map(() => true),
      timeWindow: signals.length, timeWindowSeconds: signals.length,
    };
  }

  private buildMatrix(bacteria: BacteriumEntry[]): number[][] {
    if (!bacteria.length) return [];
    const weeks = bacteria[0].data.map(d => d.week);
    return weeks.map((_, wi) => bacteria.map(b => b.data[wi]?.value ?? 0));
  }

  private computeMaxValues(data: MicrobiomeResult): void {
    this.maxDI = Math.max(...data.Dysbiosis_Index.map(e => e.value), 1);
    this.maxGoodValue = Math.max(...data.Good_Bacteria.map(b => this.latestVal(b.data)), 0.001);
    this.maxBadValue = Math.max(...data.Bad_Bacteria.map(b => this.latestVal(b.data)), 0.001);
  }

  /* ── Template helpers ── */
  latestVal(data: WeekValue[]): number { return data.length ? data[data.length - 1].value : 0; }

  getBacteriaBarWidth(v: number, type: 'good' | 'bad'): number {
    const max = type === 'good' ? this.maxGoodValue : this.maxBadValue;
    return max > 0 ? (v / max) * 100 : 0;
  }

  getDILabel(di: number): string {
    if (di < 2.5) return 'Low dysbiosis';
    if (di < 4) return 'Moderate dysbiosis';
    return 'High dysbiosis';
  }

  getDICardClass(di: number): string {
    if (di < 2.5) return 'kpi-card--di-low';
    if (di < 4) return 'kpi-card--di-mid';
    return 'kpi-card--di-high';
  }

  setTab(tab: 'signals' | 'barplot' | 'heatmap' | 'profile'): void {
    this.activeTab = tab;
  }

  get cdCount(): number { return this.participants.filter(p => p.diagnosis === 'CD').length; }
  get ucCount(): number { return this.participants.filter(p => p.diagnosis === 'UC').length; }
  get nonIBDCount(): number { return this.participants.filter(p => p.diagnosis === 'nonIBD').length; }

  get cohortStats() {
    return this.analysis.cohortStats(this.allResults);
  }

  resetToQuery(): void {
    this.result = null;
    this.dysbiosisConfig = null;
    this.goodBacteriaConfig = null;
    this.badBacteriaConfig = null;
    this.activeTab = 'signals';
    this.participantIndex = null;
    this.cdr.detectChanges();
  }

  resetUpload(): void {
    this.uploadDone = false;
    this.uploadError = null;
    this.metadataFile = null;
    this.taxonomyFile = null;
    this.result = null;
    this.participantIndex = null;
    this.participants = [];
    this.allResults = [];
    this.dysbiosisConfig = null;
    this.goodBacteriaConfig = null;
    this.badBacteriaConfig = null;
    this.activeTab = 'signals';
    this.cdr.detectChanges();
  }
}
