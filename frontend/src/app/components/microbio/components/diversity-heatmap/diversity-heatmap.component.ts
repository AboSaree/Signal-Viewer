import {
  Component, Input, OnChanges,
  ViewChild, ElementRef, AfterViewInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { MicrobiomeResult, HeatmapCell, DIAGNOSIS_COLORS } from '../../models/microbiome.models';
import { MicrobiomeAnalysisService } from '../../services/microbiome-analysis.service';

@Component({
  selector: 'app-diversity-heatmap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="hm-wrap" #wrap>
      <div class="hm-toolbar">
        <span class="hm-title">Abundance Heatmap — {{ filterDiag === 'all' ? 'All Cohorts' : filterDiag }}</span>
        <div class="hm-filters">
          <button *ngFor="let f of diagFilters" class="hm-fbtn"
                  [class.active]="filterDiag===f.key"
                  [style.--ac]="f.color"
                  (click)="setFilter(f.key)">{{ f.label }}</button>
        </div>
      </div>
      <div class="hm-scroll"><svg #chart></svg></div>
    </div>
  `,
  styles: [`
    .hm-wrap{width:100%;background:#0f172a;border:1px solid #334155;border-radius:12px;overflow:hidden}
    .hm-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #1e293b;flex-wrap:wrap}
    .hm-title{font-weight:700;font-size:14px;color:#e2e8f0}
    .hm-filters{display:flex;gap:6px}
    .hm-fbtn{padding:5px 12px;border:1px solid #475569;border-radius:6px;background:transparent;color:#94a3b8;font-family:'Inter',sans-serif;font-size:11px;cursor:pointer;transition:all .2s}
    .hm-fbtn:hover{background:#1e293b;color:#e2e8f0}
    .hm-fbtn.active{background:var(--ac,#1a73e8);color:#fff;border-color:var(--ac,#1a73e8)}
    .hm-scroll{overflow:auto;max-height:650px}
    svg{display:block}
  `],
})
export class DiversityHeatmapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() results: MicrobiomeResult[] = [];

  @ViewChild('chart') chartRef!: ElementRef<SVGElement>;
  @ViewChild('wrap') wrapRef!: ElementRef<HTMLDivElement>;

  filterDiag = 'all';
  diagFilters = [
    { key: 'all', label: 'All', color: '#1a73e8' },
    { key: 'CD', label: 'CD', color: '#ef5350' },
    { key: 'UC', label: 'UC', color: '#fdd835' },
    { key: 'nonIBD', label: 'nonIBD', color: '#66bb6a' },
  ];
  private ro?: ResizeObserver;

  constructor(private svc: MicrobiomeAnalysisService) { }

  ngAfterViewInit(): void {
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.wrapRef.nativeElement);
    this.draw();
  }
  ngOnChanges(): void { if (this.chartRef) this.draw(); }
  ngOnDestroy(): void { this.ro?.disconnect(); }

  setFilter(k: string): void { this.filterDiag = k; this.draw(); }

  private draw(): void {
    if (!this.chartRef || !this.results.length) return;
    const svg = d3.select(this.chartRef.nativeElement);
    svg.selectAll('*').remove();
    d3.selectAll('.hm-tip').remove();

    const filtered = this.filterDiag === 'all'
      ? this.results : this.results.filter(r => r.diagnosis === this.filterDiag);

    if (!filtered.length) {
      svg.attr('width', 400).attr('height', 80);
      svg.append('text').attr('x', 200).attr('y', 40).attr('text-anchor', 'middle')
        .attr('fill', '#64748b').style('font-size', '14px').text('No data for this cohort');
      return;
    }

    const cells = this.svc.buildHeatmapData(filtered);
    if (!cells.length) return;

    const allRows: string[] = [];
    const rowDiag = new Map<string, string>();
    filtered.forEach(r => {
      if (!allRows.includes(r.participant_id)) {
        allRows.push(r.participant_id);
        rowDiag.set(r.participant_id, r.diagnosis);
      }
    });

    const diagOrder: Record<string, number> = { CD: 0, UC: 1, nonIBD: 2 };
    allRows.sort((a, b) => {
      const da = diagOrder[rowDiag.get(a) || ''] ?? 9;
      const db = diagOrder[rowDiag.get(b) || ''] ?? 9;
      return da !== db ? da - db : a.localeCompare(b);
    });

    const colSums = new Map<string, number>();
    cells.forEach((c: HeatmapCell) => colSums.set(c.bacterium, (colSums.get(c.bacterium) || 0) + c.value));
    const allCols = [...colSums.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

    const valMap = new Map<string, number>();
    const typeMap = new Map<string, 'good' | 'bad'>();
    cells.forEach((c: HeatmapCell) => {
      valMap.set(`${c.participantId}|${c.bacterium}`, c.value);
      typeMap.set(c.bacterium, c.type);
    });

    const cellSize = 22;
    const margin = { top: 160, right: 80, bottom: 30, left: 120 };
    const totalW = margin.left + allCols.length * cellSize + margin.right;
    const totalH = margin.top + allRows.length * cellSize + margin.bottom;

    svg.attr('width', totalW).attr('height', totalH);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleBand().domain(allCols).range([0, allCols.length * cellSize]).padding(0.06);
    const yScale = d3.scaleBand().domain(allRows).range([0, allRows.length * cellSize]).padding(0.06);

    const maxVal: number = (d3.max(cells, (c: HeatmapCell) => c.value) as number | undefined) || 1;
    const colorGood = d3.scaleSequential().domain([0, maxVal]).interpolator(d3.interpolateYlGnBu);
    const colorBad = d3.scaleSequential().domain([0, maxVal]).interpolator(d3.interpolateYlOrRd);

    const tip = d3.select('body').append('div').attr('class', 'hm-tip tooltip-d3').style('opacity', 0);

    // Draw cells
    allRows.forEach(row => {
      allCols.forEach(col => {
        const v = valMap.get(`${row}|${col}`) ?? 0;
        const type = typeMap.get(col) || 'good';
        const fill = v > 0 ? (type === 'good' ? colorGood(v) : colorBad(v)) : '#1e293b';

        g.append('rect')
          .attr('x', xScale(col)!)
          .attr('y', yScale(row)!)
          .attr('width', xScale.bandwidth())
          .attr('height', yScale.bandwidth())
          .attr('fill', fill)
          .attr('rx', 2)
          .style('cursor', 'pointer')
          .on('mouseover', (event: MouseEvent) => {
            d3.select(event.currentTarget as any).attr('stroke', '#fff').attr('stroke-width', 2);
            tip.transition().duration(150).style('opacity', 1);
            tip.html(`
              <b>${row}</b>
              <span style="color:${(DIAGNOSIS_COLORS as any)[rowDiag.get(row) || '']}">(${rowDiag.get(row)})</span><br>
              <b>${col}</b>
              <span style="color:${type === 'good' ? '#66bb6a' : '#ef5350'}">[${type}]</span><br>
              Avg Abundance: <b>${v.toFixed(5)}</b>
            `)
              .style('left', `${event.pageX + 14}px`)
              .style('top', `${event.pageY - 28}px`);
          })
          .on('mouseout', (event: MouseEvent) => {
            d3.select(event.currentTarget as any).attr('stroke', 'none');
            tip.transition().duration(200).style('opacity', 0);
          });
      });
    });

    // Column labels (rotated)
    g.selectAll('.col-lbl').data(allCols).enter().append('text')
      .attr('x', d => xScale(d)! + xScale.bandwidth() / 2 + 100)
      .attr('y', -6)
      .attr('text-anchor', 'end')
      .attr('transform', d => `rotate(-55, ${xScale(d)! + xScale.bandwidth() / 2}, -6)`)
      .attr('fill', d => (typeMap.get(d) === 'bad') ? '#ef9a9a' : '#94a3b8')
      .style('font-size', '9px')
      .text(d => d.length > 20 ? d.slice(0, 20) + '…' : d);

    // Row labels colored by diagnosis
    g.selectAll('.row-lbl').data(allRows).enter().append('text')
      .attr('x', -8)
      .attr('y', d => yScale(d)! + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', d => (DIAGNOSIS_COLORS as any)[rowDiag.get(d) || ''] || '#94a3b8')
      .style('font-size', '9px').style('font-weight', '500')
      .text(d => d.length > 14 ? d.slice(0, 14) + '…' : d);

    // Diagnosis group brackets on left side
    let prevDiag = '';
    let groupStart = 0;
    const groups: { diag: string; start: number; end: number }[] = [];

    allRows.forEach((row, i) => {
      const diag = rowDiag.get(row) || '';
      if (diag !== prevDiag) {
        if (prevDiag) {
          groups.push({
            diag: prevDiag,
            start: groupStart,
            end: yScale(allRows[i - 1])! + yScale.bandwidth(),
          });
        }
        groupStart = yScale(row)!;
        prevDiag = diag;
      }
      if (i === allRows.length - 1) {
        groups.push({ diag, start: groupStart, end: yScale(row)! + yScale.bandwidth() });
      }
    });

    groups.forEach(gr => {
      const color = (DIAGNOSIS_COLORS as any)[gr.diag] || '#94a3b8';
      g.append('rect')
        .attr('x', -margin.left + 6).attr('y', gr.start)
        .attr('width', 5).attr('height', gr.end - gr.start)
        .attr('fill', color).attr('rx', 2);
      g.append('text')
        .attr('x', -margin.left + 16).attr('y', (gr.start + gr.end) / 2)
        .attr('dominant-baseline', 'middle')
        .attr('fill', color).style('font-size', '11px').style('font-weight', '700')
        .text(gr.diag);
    });

    // Color legends
    this.drawColorLegend(g, allCols.length * cellSize + 12, maxVal, colorGood, colorBad);
  }

  private drawColorLegend(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: number, maxVal: number,
    colorGood: d3.ScaleSequential<string, never>,
    colorBad: d3.ScaleSequential<string, never>,
  ): void {
    const legendH = 120;
    const barW = 10;

    // Good legend
    const lgG = g.append('g').attr('transform', `translate(${x}, 0)`);
    lgG.append('text').attr('x', 0).attr('y', -8).attr('fill', '#94a3b8')
      .style('font-size', '9px').style('font-weight', '600').text('Beneficial');

    const defsG = lgG.append('defs');
    const gradG = defsG.append('linearGradient').attr('id', 'hm-grad-good')
      .attr('x1', '0').attr('y1', '1').attr('x2', '0').attr('y2', '0');
    d3.range(0, 1.01, 0.1).forEach(t => {
      gradG.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', colorGood(t * maxVal));
    });
    lgG.append('rect').attr('width', barW).attr('height', legendH)
      .attr('fill', 'url(#hm-grad-good)').attr('rx', 3);
    lgG.append('text').attr('x', barW + 4).attr('y', 10).attr('fill', '#94a3b8')
      .style('font-size', '8px').text(maxVal.toFixed(3));
    lgG.append('text').attr('x', barW + 4).attr('y', legendH).attr('fill', '#94a3b8')
      .style('font-size', '8px').text('0');

    // Bad legend
    const lgB = g.append('g').attr('transform', `translate(${x}, ${legendH + 30})`);
    lgB.append('text').attr('x', 0).attr('y', -8).attr('fill', '#ef9a9a')
      .style('font-size', '9px').style('font-weight', '600').text('Pathogenic');

    const defsB = lgB.append('defs');
    const gradB = defsB.append('linearGradient').attr('id', 'hm-grad-bad')
      .attr('x1', '0').attr('y1', '1').attr('x2', '0').attr('y2', '0');
    d3.range(0, 1.01, 0.1).forEach(t => {
      gradB.append('stop').attr('offset', `${t * 100}%`).attr('stop-color', colorBad(t * maxVal));
    });
    lgB.append('rect').attr('width', barW).attr('height', legendH)
      .attr('fill', 'url(#hm-grad-bad)').attr('rx', 3);
    lgB.append('text').attr('x', barW + 4).attr('y', 10).attr('fill', '#94a3b8')
      .style('font-size', '8px').text(maxVal.toFixed(3));
    lgB.append('text').attr('x', barW + 4).attr('y', legendH).attr('fill', '#94a3b8')
      .style('font-size', '8px').text('0');
  }
}
