export interface WeekValue {
  week: number;
  value: number;
}

export interface BacteriumEntry {
  name: string;
  data: WeekValue[];
}

export interface MicrobiomeResult {
  participant_id: string;
  diagnosis: string;
  Dysbiosis_Index: WeekValue[];
  Average_Dysbiosis_Index: number;
  Good_Bacteria: BacteriumEntry[];
  Bad_Bacteria: BacteriumEntry[];
}

export interface ParticipantInfo {
  id: string;
  diagnosis: string;
}

export interface SignalGraphConfig {
  signals: number[][];
  channels: string[];
  signalType: string;
  mode: string;
  fs: number;
  selectedChannels: boolean[];
  currentIndex: number;
  timeWindow: number;
  timeWindowSeconds: number;
  polarMode: string;
  reoccurrenceChX: number;
  reoccurrenceChY: number;
  reoccurrenceColorMap: string;
}

export interface HeatmapCell {
  participantId: string;
  bacterium: string;
  value: number;
  diagnosis: string;
  type: 'good' | 'bad';
}

export interface BarSegment {
  name: string;
  value: number;
  type: 'good' | 'bad';
}

export interface BarplotEntry {
  participantId: string;
  diagnosis: string;
  segments: BarSegment[];
}

export interface RawMetadataRow {
  [key: string]: any;
}

export interface RawTaxonomyRow {
  [key: string]: any;
}

export interface ParsedMetadata {
  sampleId: string;
  participantId: string;
  diagnosis: string;
  weekNum: number;
}

export interface ParsedTaxonomy {
  sampleId: string;
  abundances: { [taxon: string]: number };
}

export const DIAGNOSIS_COLORS: Record<string, string> = {
  CD: '#ef5350',
  UC: '#fdd835',
  nonIBD: '#66bb6a',
};

export const CHANNEL_COLORS: string[] = [
  '#00E5FF', '#FF6D00', '#76FF03', '#E040FB', '#FFEA00',
  '#FF1744', '#00E676', '#D500F9', '#FFC400', '#2979FF',
  '#F50057', '#00BFA5', '#DD2C00', '#651FFF', '#C6FF00',
  '#1DE9B6', '#FF9100', '#B388FF', '#69F0AE', '#FF80AB',
];

export const TAXONOMY_COLORS: string[] = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
  '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
  '#393b79', '#5254a3', '#6b6ecf', '#9c9ede', '#637939',
];

// Known beneficial bacteria (partial names for fuzzy matching)
export const GOOD_BACTERIA_MARKERS: string[] = [
  'faecalibacterium', 'roseburia', 'bifidobacterium', 'lactobacillus',
  'akkermansia', 'eubacterium', 'coprococcus', 'blautia',
  'prevotella', 'ruminococcaceae', 'lachnospiraceae', 'butyricicoccus',
  'odoribacter', 'parabacteroides', 'alistipes', 'oscillospira',
  'christensenellaceae', 'methanobrevibacter', 'butyrivibrio',
  'collinsella',
];

// Known pathogenic / dysbiosis-associated bacteria
export const BAD_BACTERIA_MARKERS: string[] = [
  'enterobacteriaceae', 'fusobacterium', 'escherichia', 'klebsiella',
  'proteus', 'campylobacter', 'helicobacter', 'clostridium',
  'clostridioides', 'enterococcus', 'staphylococcus', 'streptococcus',
  'veillonella', 'megasphaera', 'dialister', 'haemophilus',
  'bilophila', 'desulfovibrio', 'pseudomonas', 'acinetobacter',
  'ruminococcus_gnavus', 'r.gnavus',
];
