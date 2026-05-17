import { Injectable } from '@angular/core';
import * as Papa from 'papaparse';
import { ParsedMetadata, ParsedTaxonomy, RawMetadataRow, RawTaxonomyRow } from '../models/microbiome.models';

@Injectable({ providedIn: 'root' })
export class CsvParserService {

  parseFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (result) => resolve(result.data),
        error: (err) => reject(err),
      });
    });
  }

  parseMetadata(raw: RawMetadataRow[]): ParsedMetadata[] {
    return raw.map(row => {
      const sampleIdKey = this.findKey(row, [
        'sample_id', 'sampleid', 'sample', 'external_id',
        '#sampleid', 'externalid', 'external id',
      ]);
      const participantKey = this.findKey(row, [
        'participant_id', 'participantid', 'participant',
        'subject_id', 'subject', 'host_subject_id', 'participant id',
      ]);
      const diagnosisKey = this.findKey(row, [
        'diagnosis', 'disease', 'condition', 'group',
        'disease_state', 'health_status',
      ]);
      const weekKey = this.findKey(row, [
        'week_num', 'weeknum', 'week', 'timepoint',
        'visit', 'visit_num', 'collection_week',
      ]);

      return {
        sampleId: sampleIdKey ? String(row[sampleIdKey]).trim() : '',
        participantId: participantKey ? String(row[participantKey]).trim() : '',
        diagnosis: this.normalizeDiagnosis(diagnosisKey ? String(row[diagnosisKey]).trim() : 'unknown'),
        weekNum: weekKey ? Number(row[weekKey]) || 0 : 0,
      };
    }).filter(r => r.sampleId && r.sampleId !== 'undefined' && r.sampleId !== 'null');
  }

  parseTaxonomy(raw: RawTaxonomyRow[]): ParsedTaxonomy[] {
    return raw.map(row => {
      const sampleIdKey = this.findKey(row, [
        'sample_id', 'sampleid', 'sample', 'external_id',
        '#sampleid', 'externalid', 'index', 'external id',
      ]);

      const abundances: { [taxon: string]: number } = {};
      Object.keys(row).forEach(key => {
        if (key !== sampleIdKey) {
          const v = row[key];
          const num = typeof v === 'number' ? v : parseFloat(String(v));
          if (!isNaN(num)) {
            abundances[key] = num;
          }
        }
      });

      return {
        sampleId: sampleIdKey ? String(row[sampleIdKey]).trim() : '',
        abundances,
      };
    }).filter(r => r.sampleId && r.sampleId !== 'undefined' && r.sampleId !== 'null');
  }

  private findKey(obj: any, candidates: string[]): string | null {
    const keys = Object.keys(obj);
    for (const c of candidates) {
      const found = keys.find(k =>
        k.toLowerCase().replace(/[_\s\-#]/g, '') === c.toLowerCase().replace(/[_\s\-#]/g, '')
      );
      if (found) return found;
    }
    // Fallback: first key containing 'id' or 'sample'
    const fallback = keys.find(k =>
      k.toLowerCase().includes('sample') || k.toLowerCase().includes('external')
    );
    return fallback || null;
  }

  private normalizeDiagnosis(raw: string): string {
    const l = raw.toLowerCase().trim();
    if (['cd', 'crohn', "crohn's", 'crohns', "crohn's disease"].includes(l)) return 'CD';
    if (['uc', 'ulcerative colitis', 'ulcerativecolitis'].includes(l)) return 'UC';
    if (['nonibd', 'non-ibd', 'non_ibd', 'control', 'healthy', 'no'].includes(l)) return 'nonIBD';
    return raw;
  }
}
