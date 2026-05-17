import { Injectable } from '@angular/core';
import {
  ParsedMetadata, ParsedTaxonomy, MicrobiomeResult,
  ParticipantInfo, WeekValue, BacteriumEntry,
  HeatmapCell, BarplotEntry, BarSegment,
  GOOD_BACTERIA_MARKERS, BAD_BACTERIA_MARKERS,
} from '../models/microbiome.models';

interface JoinedSample {
  sampleId: string;
  participantId: string;
  diagnosis: string;
  weekNum: number;
  abundances: { [taxon: string]: number };
}

@Injectable({ providedIn: 'root' })
export class MicrobiomeAnalysisService {

  private joinedData: JoinedSample[] = [];
  private participantMap = new Map<string, JoinedSample[]>();
  private allResults: MicrobiomeResult[] = [];
  private allTaxa: string[] = [];

  /* ═══════════════════ Main processing pipeline ═══════════════════ */

  processDataset(metadata: ParsedMetadata[], taxonomy: ParsedTaxonomy[]): {
    participants: ParticipantInfo[];
    results: MicrobiomeResult[];
  } {
    const taxMap = new Map<string, ParsedTaxonomy>();
    taxonomy.forEach(t => taxMap.set(t.sampleId, t));

    this.joinedData = metadata
      .filter(m => taxMap.has(m.sampleId))
      .map(m => ({
        sampleId: m.sampleId,
        participantId: m.participantId,
        diagnosis: m.diagnosis,
        weekNum: m.weekNum,
        abundances: taxMap.get(m.sampleId)!.abundances,
      }));

    const taxaSet = new Set<string>();
    this.joinedData.forEach(s => Object.keys(s.abundances).forEach(t => taxaSet.add(t)));
    this.allTaxa = [...taxaSet];

    this.participantMap.clear();
    this.joinedData.forEach(s => {
      if (!this.participantMap.has(s.participantId)) {
        this.participantMap.set(s.participantId, []);
      }
      this.participantMap.get(s.participantId)!.push(s);
    });

    this.participantMap.forEach(samples => {
      samples.sort((a, b) => a.weekNum - b.weekNum);
    });

    this.allResults = [];
    const participants: ParticipantInfo[] = [];

    this.participantMap.forEach((samples, pid) => {
      const diagnosis = samples[0].diagnosis;
      participants.push({ id: pid, diagnosis });
      this.allResults.push(this.buildResult(pid, samples));
    });

    const diagOrder: Record<string, number> = { CD: 0, UC: 1, nonIBD: 2 };
    participants.sort((a, b) => {
      const da = diagOrder[a.diagnosis] ?? 9;
      const db = diagOrder[b.diagnosis] ?? 9;
      return da !== db ? da - db : a.id.localeCompare(b.id);
    });

    return { participants, results: this.allResults };
  }

  private buildResult(participantId: string, samples: JoinedSample[]): MicrobiomeResult {
    const diagnosis = samples[0].diagnosis;

    const goodTaxaNames: string[] = [];
    const badTaxaNames: string[] = [];

    this.allTaxa.forEach(taxon => {
      const classification = this.classifyBacterium(taxon);
      if (classification === 'good') goodTaxaNames.push(taxon);
      else if (classification === 'bad') badTaxaNames.push(taxon);
    });

    const presentGood = goodTaxaNames.filter(t =>
      samples.some(s => (s.abundances[t] || 0) > 0)
    );
    const presentBad = badTaxaNames.filter(t =>
      samples.some(s => (s.abundances[t] || 0) > 0)
    );

    const topGood = this.topByAvg(presentGood, samples, 10);
    const topBad = this.topByAvg(presentBad, samples, 10);

    const goodBacteria: BacteriumEntry[] = topGood.map(taxon => ({
      name: this.shortenName(taxon),
      data: samples.map((s, i) => ({
        week: s.weekNum || i,
        value: this.normalizeAbundance(s.abundances[taxon] || 0),
      })),
    }));

    const badBacteria: BacteriumEntry[] = topBad.map(taxon => ({
      name: this.shortenName(taxon),
      data: samples.map((s, i) => ({
        week: s.weekNum || i,
        value: this.normalizeAbundance(s.abundances[taxon] || 0),
      })),
    }));

    const dysbiosisIndex: WeekValue[] = samples.map((s, i) => {
      const goodSum = presentGood.reduce((sum, t) => sum + (s.abundances[t] || 0), 0);
      const badSum = presentBad.reduce((sum, t) => sum + (s.abundances[t] || 0), 0);
      const di = this.computeDysbiosisIndex(goodSum, badSum);
      return { week: s.weekNum || i, value: di };
    });

    const avgDI = dysbiosisIndex.length
      ? dysbiosisIndex.reduce((s, d) => s + d.value, 0) / dysbiosisIndex.length
      : 0;

    return {
      participant_id: participantId,
      diagnosis,
      Dysbiosis_Index: dysbiosisIndex,
      Average_Dysbiosis_Index: avgDI,
      Good_Bacteria: goodBacteria,
      Bad_Bacteria: badBacteria,
    };
  }

  private classifyBacterium(taxon: string): 'good' | 'bad' | 'neutral' {
    const lower = taxon.toLowerCase().replace(/[_.\-\s]/g, '');
    for (const marker of GOOD_BACTERIA_MARKERS) {
      if (lower.includes(marker.replace(/[_.\-\s]/g, ''))) return 'good';
    }
    for (const marker of BAD_BACTERIA_MARKERS) {
      if (lower.includes(marker.replace(/[_.\-\s]/g, ''))) return 'bad';
    }
    return 'neutral';
  }

  private topByAvg(taxa: string[], samples: JoinedSample[], n: number): string[] {
    const avgs = taxa.map(t => ({
      taxon: t,
      avg: samples.reduce((s, sam) => s + (sam.abundances[t] || 0), 0) / samples.length,
    }));
    avgs.sort((a, b) => b.avg - a.avg);
    return avgs.slice(0, n).map(a => a.taxon);
  }

  private normalizeAbundance(value: number): number {
    if (value > 1) return value / 1000000;
    return value;
  }

  private computeDysbiosisIndex(goodSum: number, badSum: number): number {
    const epsilon = 0.0001;
    const ratio = Math.log2((badSum + epsilon) / (goodSum + epsilon));
    const scaled = Math.max(0, Math.min(6, ratio + 3));
    return Math.round(scaled * 100) / 100;
  }

  private shortenName(taxon: string): string {
    let name = taxon.replace(/^[kpcofgs]__/gi, '');
    if (name.includes(';')) {
      const parts = name.split(';').filter(p => p.trim() && !p.includes('__'));
      name = parts[parts.length - 1] || name;
    }
    if (name.includes('|')) {
      const parts = name.split('|').filter(p => p.trim());
      name = parts[parts.length - 1] || name;
    }
    return name.trim();
  }

  getResult(index: number): MicrobiomeResult | null {
    return this.allResults[index] || null;
  }

  getResultById(participantId: string): MicrobiomeResult | null {
    return this.allResults.find(r => r.participant_id === participantId) || null;
  }

  getAllResults(): MicrobiomeResult[] {
    return this.allResults;
  }

  buildHeatmapData(results: MicrobiomeResult[]): HeatmapCell[] {
    const cells: HeatmapCell[] = [];
    results.forEach(r => {
      const add = (list: BacteriumEntry[], type: 'good' | 'bad') => {
        list.forEach(b => {
          const avg = b.data.length
            ? b.data.reduce((s, d) => s + d.value, 0) / b.data.length
            : 0;
          cells.push({
            participantId: r.participant_id,
            bacterium: b.name,
            value: avg,
            diagnosis: r.diagnosis,
            type,
          });
        });
      };
      add(r.Good_Bacteria, 'good');
      add(r.Bad_Bacteria, 'bad');
    });
    return cells;
  }

  buildBarplotData(results: MicrobiomeResult[]): BarplotEntry[] {
    return results.map(r => {
      const segments: BarSegment[] = [];
      r.Good_Bacteria.forEach(b => {
        const latest = b.data.length ? b.data[b.data.length - 1].value : 0;
        segments.push({ name: b.name, value: latest, type: 'good' });
      });
      r.Bad_Bacteria.forEach(b => {
        const latest = b.data.length ? b.data[b.data.length - 1].value : 0;
        segments.push({ name: b.name, value: latest, type: 'bad' });
      });
      return { participantId: r.participant_id, diagnosis: r.diagnosis, segments };
    });
  }

  cohortStats(results: MicrobiomeResult[]): { diagnosis: string; count: number; avgDI: number }[] {
    const map = new Map<string, { sum: number; count: number }>();
    results.forEach(r => {
      const e = map.get(r.diagnosis) || { sum: 0, count: 0 };
      e.sum += r.Average_Dysbiosis_Index;
      e.count += 1;
      map.set(r.diagnosis, e);
    });
    return [...map.entries()].map(([d, e]) => ({
      diagnosis: d,
      count: e.count,
      avgDI: e.sum / e.count,
    }));
  }
}
