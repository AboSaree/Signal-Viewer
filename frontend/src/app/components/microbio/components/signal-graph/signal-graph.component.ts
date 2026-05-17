import {
  Component, Input, OnChanges, SimpleChanges,
  ViewChild, ElementRef, AfterViewInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { SignalGraphConfig, CHANNEL_COLORS } from '../../models/microbiome.models';

@Component({
  selector: 'app-signal-graph',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sg-wrap" #wrap>
      <div class="sg-toolbar">
        <span class="sg-title">{{ config?.signalType }}</span>
        <div class="sg-channels">
          <label *ngFor="let ch of config?.channels; let i = index" class="sg-ch-toggle">
            <input type="checkbox" [checked]="channelVisible[i]" (change)="toggleChannel(i)">
            <span class="sg-ch-color" [style.background]="channelColor(i)"></span>
            <span class="sg-ch-name">{{ ch }}</span>
          </label>
        </div>
      </div>
      <svg #chart></svg>
    </div>
  `,
  styles: [`
    .sg-wrap{width:100%;background:#0f172a;border:1px solid #334155;border-radius:12px;overflow:hidden}
    .sg-toolbar{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid #1e293b;flex-wrap:wrap}
    .sg-title{font-weight:700;font-size:14px;color:#e2e8f0;white-space:nowrap}
    .sg-channels{display:flex;flex-wrap:wrap;gap:10px}
    .sg-ch-toggle{display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:#94a3b8}
    .sg-ch-toggle input{display:none}
    .sg-ch-color{width:10px;height:10px;border-radius:2px}
    .sg-ch-name{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    svg{display:block;width:100%}
  `],
})
export class SignalGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() config: SignalGraphConfig | null = null;
  @Input() height = 300;

  @ViewChild('chart') chartRef!: ElementRef<SVGElement>;
  @ViewChild('wrap') wrapRef!: ElementRef<HTMLDivElement>;

  channelVisible: boolean[] = [];
  private ro?: ResizeObserver;

  ngAfterViewInit(): void {
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.wrapRef.nativeElement);
    this.draw();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && this.config) {
      this.channelVisible = [...this.config.selectedChannels];
      if (this.chartRef) this.draw();
    }
  }

  ngOnDestroy(): void { this.ro?.disconnect(); }

  channelColor(i: number): string {
    return CHANNEL_COLORS[i % CHANNEL_COLORS.length];
  }

  toggleChannel(i: number): void {
    this.channelVisible[i] = !this.channelVisible[i];
    this.draw();
  }

  private draw(): void {
    if (!this.chartRef || !this.config || !this.config.signals.length) return;

    const svg = d3.select(this.chartRef.nativeElement);
    svg.selectAll('*').remove();
    d3.selectAll('.sg-tip').remove();

    const { signals, channels } = this.config;
    const nTime = signals.length;
    const nCh = channels.length;
    if (!nTime || !nCh) return;

    const w = this.wrapRef.nativeElement.clientWidth;
    const margin = { top: 24, right: 24, bottom: 44, left: 56 };
    const width = w - margin.left - margin.right;
    const height = this.height - margin.top - margin.bottom;

    svg.attr('width', w).attr('height', this.height);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([0, nTime - 1]).range([0, width]);

    let yMin = Infinity, yMax = -Infinity;
    for (let t = 0; t < nTime; t++) {
      for (let c = 0; c < nCh; c++) {
        if (!this.channelVisible[c]) continue;
        const v = signals[t][c];
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (yMin === Infinity) { yMin = 0; yMax = 1; }
    const pad = (yMax - yMin) * 0.08 || 0.5;
    const yScale = d3.scaleLinear().domain([yMin - pad, yMax + pad]).range([height, 0]);

    // Grid
    g.append('g').call(d3.axisLeft(yScale).ticks(6).tickSize(-width).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#1e293b');
    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(nTime, 12)).tickSize(-height).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#1e293b');

    // Axes
    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(nTime, 12)).tickFormat(d => `W${d}`))
      .selectAll('text').attr('fill', '#94a3b8').style('font-size', '11px');
    g.append('g').call(d3.axisLeft(yScale).ticks(6))
      .selectAll('text').attr('fill', '#94a3b8').style('font-size', '11px');
    g.selectAll('.domain').attr('stroke', '#475569');

    g.append('text').attr('x', width / 2).attr('y', height + 36)
      .attr('text-anchor', 'middle').attr('fill', '#64748b').style('font-size', '12px').text('Week');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -height / 2).attr('y', -42)
      .attr('text-anchor', 'middle').attr('fill', '#64748b').style('font-size', '12px').text('Value');

    const tip = d3.select('body').append('div').attr('class', 'sg-tip tooltip-d3').style('opacity', 0);

    for (let c = 0; c < nCh; c++) {
      if (!this.channelVisible[c]) continue;
      const color = this.channelColor(c);
      const pts: { t: number; v: number }[] = [];
      for (let t = 0; t < nTime; t++) pts.push({ t, v: signals[t][c] });

      g.append('path').datum(pts)
        .attr('fill', color).attr('fill-opacity', 0.06)
        .attr('d', d3.area<{ t: number; v: number }>()
          .x(d => xScale(d.t)).y0(height).y1(d => yScale(d.v))
          .curve(d3.curveMonotoneX) as any);

      g.append('path').datum(pts)
        .attr('fill', 'none').attr('stroke', color)
        .attr('stroke-width', 2).attr('stroke-opacity', 0.85)
        .attr('d', d3.line<{ t: number; v: number }>()
          .x(d => xScale(d.t)).y(d => yScale(d.v))
          .curve(d3.curveMonotoneX) as any);

      g.selectAll(`.dot-c${c}`).data(pts).enter().append('circle')
        .attr('cx', d => xScale(d.t)).attr('cy', d => yScale(d.v))
        .attr('r', 3.5).attr('fill', color).attr('stroke', '#0f172a').attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mouseover', (event: MouseEvent, d: { t: number; v: number }) => {
          d3.select(event.currentTarget as any).attr('r', 6);
          tip.transition().duration(150).style('opacity', 1);
          tip.html(`<b>${channels[c]}</b><br>Week ${d.t}<br>Value: <b>${d.v.toFixed(4)}</b>`)
            .style('left', `${event.pageX + 14}px`).style('top', `${event.pageY - 28}px`);
        })
        .on('mouseout', (event: MouseEvent) => {
          d3.select(event.currentTarget as any).attr('r', 3.5);
          tip.transition().duration(200).style('opacity', 0);
        });
    }
  }
}
