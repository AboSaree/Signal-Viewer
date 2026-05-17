import {
  Component, Input, OnChanges, SimpleChanges,
  ViewChild, ElementRef, AfterViewInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import {
  MicrobiomeResult, BarplotEntry, BarSegment, DIAGNOSIS_COLORS, TAXONOMY_COLORS,
} from '../../models/microbiome.models';
import { MicrobiomeAnalysisService } from '../../services/microbiome-analysis.service';

@Component({
  selector: 'app-taxonomic-barplot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bp-wrap" #wrap>
      <div class="bp-toolbar">
        <span class="bp-label">View:</span>
        <button class="bp-btn" [class.active]="viewMode==='single'" (click)="setView('single')">
          Selected Participant
        </button>
        <button class="bp-btn" [class.active]="viewMode==='all'" (click)="setView('all')"
                [disabled]="!allResults.length">
          All Participants ({{ allResults.length }})
        </button>
      </div>
      <svg #chart></svg>
      <div class="bp-legend" *ngIf="legendItems.length">
        <div *ngFor="let l of legendItems" class="bp-legend-item">
          <span class="bp-lcolor" [style.background]="l.color"></span>
          <span class="bp-lname" [class.bad]="l.type==='bad'">{{ l.name }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .bp-wrap{width:100%;background:#0f172a;border:1px solid #334155;border-radius:12px;overflow:hidden}
    .bp-toolbar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #1e293b}
    .bp-label{color:#94a3b8;font-size:13px;font-weight:600}
    .bp-btn{padding:6px 14px;border:1px solid #475569;border-radius:6px;background:transparent;
      color:#94a3b8;font-family:'Inter',sans-serif;font-size:12px;cursor:pointer;transition:all .2s}
    .bp-btn:hover{background:#1e293b;color:#e2e8f0}
    .bp-btn.active{background:#1a73e8;color:#fff;border-color:#1a73e8}
    .bp-btn:disabled{opacity:.4;cursor:not-allowed}
    svg{display:block;width:100%}
    .bp-legend{display:flex;flex-wrap:wrap;gap:6px 14px;padding:12px 16px;justify-content:center}
    .bp-legend-item{display:flex;align-items:center;gap:4px;font-size:11px;color:#94a3b8}
    .bp-lcolor{width:10px;height:10px;border-radius:2px;flex-shrink:0}
    .bp-lname{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .bp-lname.bad{text-decoration:underline;text-decoration-color:#ef5350;text-underline-offset:2px}
  `],
})
export class TaxonomicBarplotComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() singleResult: MicrobiomeResult | null = null;
  @Input() allResults: MicrobiomeResult[] = [];
  @Input() height = 420;

  @ViewChild('chart') chartRef!: ElementRef<SVGElement>;
  @ViewChild('wrap') wrapRef!: ElementRef<HTMLDivElement>;

  viewMode: 'single' | 'all' = 'single';
  legendItems: { name: string; color: string; type: string }[] = [];
  private ro?: ResizeObserver;

  constructor(private svc: MicrobiomeAnalysisService) {}

  ngAfterViewInit(): void {
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.wrapRef.nativeElement);
    this.draw();
  }
  ngOnChanges(): void { if (this.chartRef) this.draw(); }
  ngOnDestroy(): void { this.ro?.disconnect(); }

  setView(m: 'single' | 'all'): void { this.viewMode = m; this.draw(); }

  private draw(): void {
    if (!this.chartRef) return;
    const svg = d3.select(this.chartRef.nativeElement);
    svg.selectAll('*').remove();
    d3.selectAll('.bp-tip').remove();
    this.viewMode === 'single' ? this.drawSingle(svg) : this.drawAll(svg);
  }

  /* ── Single participant horizontal bars ── */
  private drawSingle(svg: d3.Selection<SVGElement, unknown, null, undefined>): void {
    if (!this.singleResult) return;
    const bacteria = [
      ...this.singleResult.Good_Bacteria.map(b => ({
        name: b.name, value: b.data.length ? b.data[b.data.length - 1].value : 0, type: 'good' as const,
      })),
      ...this.singleResult.Bad_Bacteria.map(b => ({
        name: b.name, value: b.data.length ? b.data[b.data.length - 1].value : 0, type: 'bad' as const,
      })),
    ].sort((a, b) => b.value - a.value);

    this.legendItems = [];
    const containerW = this.wrapRef.nativeElement.clientWidth;
    const margin = { top: 20, right: 90, bottom: 20, left: 180 };
    const h = Math.max(this.height, bacteria.length * 28 + margin.top + margin.bottom);
    const w = containerW - margin.left - margin.right;
    const ch = h - margin.top - margin.bottom;

    svg.attr('width', containerW).attr('height', h);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain([0, d3.max(bacteria, d => d.value)! * 1.15 || 1]).range([0, w]);
    const y = d3.scaleBand().domain(bacteria.map(d => d.name)).range([0, ch]).padding(0.2);
    const tip = d3.select('body').append('div').attr('class', 'bp-tip tooltip-d3').style('opacity', 0);

    g.selectAll('.bg').data(bacteria).enter().append('rect')
      .attr('x', 0).attr('y', d => y(d.name)!).attr('width', w).attr('height', y.bandwidth())
      .attr('fill', '#1e293b').attr('rx', 4);

    g.selectAll('.bar').data(bacteria).enter().append('rect')
      .attr('x', 0).attr('y', d => y(d.name)!)
      .attr('width', d => x(d.value)).attr('height', y.bandwidth())
      .attr('fill', (d, i) => d.type === 'good'
        ? TAXONOMY_COLORS[i % TAXONOMY_COLORS.length]
        : d3.color(TAXONOMY_COLORS[i % TAXONOMY_COLORS.length])!.darker(0.8).toString())
      .attr('rx', 4).attr('opacity', 0.85).style('cursor', 'pointer')
      .on('mouseover', (event: MouseEvent, d: any) => {
        d3.select(event.currentTarget as any).attr('opacity', 1);
        tip.transition().duration(150).style('opacity', 1);
        tip.html(`<b>${d.name}</b><br>Type: <span style="color:${d.type === 'good' ? '#66bb6a' : '#ef5350'}">${d.type === 'good' ? '✓ Beneficial' : '✗ Pathogenic'}</span><br>Abundance: <b>${d.value.toFixed(4)}</b>`)
          .style('left', `${event.pageX + 14}px`).style('top', `${event.pageY - 28}px`);
      })
      .on('mouseout', (event: MouseEvent) => {
        d3.select(event.currentTarget as any).attr('opacity', 0.85);
        tip.transition().duration(200).style('opacity', 0);
      });

    g.selectAll('.type-dot').data(bacteria).enter().append('circle')
      .attr('cx', -10).attr('cy', d => y(d.name)! + y.bandwidth() / 2).attr('r', 4)
      .attr('fill', d => d.type === 'good' ? '#66bb6a' : '#ef5350');

    g.selectAll('.label').data(bacteria).enter().append('text')
      .attr('x', -16).attr('y', d => y(d.name)! + y.bandwidth() / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#cbd5e1').style('font-size', '11px')
      .text(d => d.name.length > 24 ? d.name.slice(0, 24) + '…' : d.name);

    g.selectAll('.val').data(bacteria).enter().append('text')
      .attr('x', d => x(d.value) + 6).attr('y', d => y(d.name)! + y.bandwidth() / 2)
      .attr('dominant-baseline', 'middle').attr('fill', '#94a3b8')
      .style('font-size', '11px').style('font-weight', '600')
      .text(d => d.value.toFixed(4));
  }

  /* ── All participants stacked bars ── */
  private drawAll(svg: d3.Selection<SVGElement, unknown, null, undefined>): void {
    if (!this.allResults.length) return;

    const entries = this.svc.buildBarplotData(this.allResults);
    const diagOrder: Record<string, number> = { CD: 0, UC: 1, nonIBD: 2 };
    entries.sort((a: BarplotEntry, b: BarplotEntry) => (diagOrder[a.diagnosis] ?? 9) - (diagOrder[b.diagnosis] ?? 9));

    const allBacteria = new Set<string>();
    entries.forEach((e: BarplotEntry) => e.segments.forEach((s: BarSegment) => allBacteria.add(s.name)));
    const bacteriaList = [...allBacteria];
    const colorScale = d3.scaleOrdinal<string>().domain(bacteriaList).range(TAXONOMY_COLORS);

    this.legendItems = bacteriaList.map(name => {
      const seg = entries.flatMap((e: BarplotEntry) => e.segments).find((s: BarSegment) => s.name === name);
      return { name, color: colorScale(name), type: seg?.type || 'good' };
    });

    const containerW = this.wrapRef.nativeElement.clientWidth;
    const dynamicW = Math.max(containerW, entries.length * 16 + 120);
    const margin = { top: 30, right: 20, bottom: 90, left: 56 };
    const w = dynamicW - margin.left - margin.right;
    const h = this.height - margin.top - margin.bottom;

    svg.attr('width', dynamicW).attr('height', this.height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const stackData: any[] = entries.map((e: BarplotEntry) => {
      const row: any = { participantId: e.participantId, diagnosis: e.diagnosis };
      bacteriaList.forEach(b => { row[b] = 0; });
      e.segments.forEach((s: BarSegment) => { row[s.name] = s.value; });
      const total = bacteriaList.reduce((sum, b) => sum + (row[b] as number), 0);
      if (total > 0) bacteriaList.forEach(b => { row[b] = (row[b] as number) / total; });
      return row;
    });

    const stacked = d3.stack<any>().keys(bacteriaList).order(d3.stackOrderNone).offset(d3.stackOffsetNone)(stackData);
    const xScale = d3.scaleBand().domain(stackData.map(d => d.participantId)).range([0, w]).padding(0.12);
    const yScale = d3.scaleLinear().domain([0, 1]).range([h, 0]);

    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(xScale)).selectAll('text')
      .attr('transform', 'rotate(-50)').attr('text-anchor', 'end')
      .attr('fill', '#94a3b8').style('font-size', '8px');
    g.append('g').call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('.0%')))
      .selectAll('text').attr('fill', '#94a3b8').style('font-size', '11px');
    g.selectAll('.domain').attr('stroke', '#475569');
    g.selectAll('.tick line').attr('stroke', '#475569');

    const tip = d3.select('body').append('div').attr('class', 'bp-tip tooltip-d3').style('opacity', 0);

    stacked.forEach(layer => {
      g.selectAll(`.bar-${layer.key.replace(/[^a-zA-Z0-9]/g, '')}`)
        .data(layer).enter().append('rect')
        .attr('x', d => xScale((d.data as any).participantId)!)
        .attr('y', d => yScale(d[1]))
        .attr('height', d => yScale(d[0]) - yScale(d[1]))
        .attr('width', xScale.bandwidth())
        .attr('fill', colorScale(layer.key))
        .attr('stroke', '#0f172a').attr('stroke-width', 0.3)
        .style('cursor', 'pointer')
        .on('mouseover', (event: MouseEvent, d: any) => {
          const ab = d[1] - d[0];
          tip.transition().duration(150).style('opacity', 1);
          tip.html(`<b>${(d.data as any).participantId}</b> <span style="color:${(DIAGNOSIS_COLORS as any)[(d.data as any).diagnosis]}">(${(d.data as any).diagnosis})</span><br><span style="color:${colorScale(layer.key)}">■</span> ${layer.key}<br>Abundance: <b>${(ab * 100).toFixed(2)}%</b>`)
            .style('left', `${event.pageX + 14}px`).style('top', `${event.pageY - 28}px`);
        })
        .on('mouseout', () => { tip.transition().duration(200).style('opacity', 0); });
    });

    // Diagnosis group headers
    const diagnoses = [...new Set(stackData.map(d => d.diagnosis))];
    diagnoses.forEach(diag => {
      const items = stackData.filter(d => d.diagnosis === diag);
      if (!items.length) return;
      const startX = xScale(items[0].participantId)!;
      const endX = xScale(items[items.length - 1].participantId)! + xScale.bandwidth();
      g.append('rect').attr('x', startX).attr('y', -22).attr('width', endX - startX).attr('height', 16)
        .attr('fill', (DIAGNOSIS_COLORS as any)[diag] || '#94a3b8').attr('rx', 4).attr('opacity', 0.75);
      g.append('text').attr('x', (startX + endX) / 2).attr('y', -11)
        .attr('text-anchor', 'middle').attr('fill', '#fff')
        .style('font-size', '10px').style('font-weight', '700').text(`${diag} (${items.length})`);
    });
  }
}
