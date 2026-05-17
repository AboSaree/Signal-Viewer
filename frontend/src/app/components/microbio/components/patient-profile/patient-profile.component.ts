import {
    Component, Input, OnChanges, SimpleChanges,
    ViewChild, ElementRef, AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import {
    MicrobiomeResult, DIAGNOSIS_COLORS, TAXONOMY_COLORS,
} from '../../models/microbiome.models';

@Component({
    selector: 'app-patient-profile',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="pp-card" *ngIf="result">
      <!-- Header -->
      <div class="pp-header">
        <div class="pp-avatar" [style.borderColor]="diagColor">
          <span class="material-icons">person</span>
        </div>
        <div class="pp-info">
          <h2>{{ result.participant_id }}</h2>
          <span class="pp-badge" [ngClass]="'pp-badge--' + result.diagnosis.toLowerCase()">
            {{ result.diagnosis }}
          </span>
        </div>
        <div class="pp-di-ring">
          <svg viewBox="0 0 90 90" width="90" height="90">
            <circle cx="45" cy="45" r="38" fill="none" stroke="#334155" stroke-width="6"/>
            <circle cx="45" cy="45" r="38" fill="none"
                    [attr.stroke]="diRingColor"
                    stroke-width="6" stroke-linecap="round"
                    [attr.stroke-dasharray]="circumference"
                    [attr.stroke-dashoffset]="diOffset"
                    transform="rotate(-90 45 45)"/>
            <text x="45" y="42" text-anchor="middle" fill="#e2e8f0" font-size="16" font-weight="700">
              {{ result.Average_Dysbiosis_Index.toFixed(1) }}
            </text>
            <text x="45" y="56" text-anchor="middle" fill="#94a3b8" font-size="8">DI avg</text>
          </svg>
        </div>
      </div>

      <!-- KPIs -->
      <div class="pp-kpis">
        <div class="pp-kpi">
          <span class="pp-kpi-val">{{ result.Good_Bacteria.length }}</span>
          <span class="pp-kpi-lbl good">Good Bacteria</span>
        </div>
        <div class="pp-kpi">
          <span class="pp-kpi-val">{{ result.Bad_Bacteria.length }}</span>
          <span class="pp-kpi-lbl bad">Bad Bacteria</span>
        </div>
        <div class="pp-kpi">
          <span class="pp-kpi-val">{{ totalWeeks }}</span>
          <span class="pp-kpi-lbl">Sample Weeks</span>
        </div>
        <div class="pp-kpi">
          <span class="pp-kpi-val" [style.color]="diRingColor">{{ diLabel }}</span>
          <span class="pp-kpi-lbl">Risk Level</span>
        </div>
      </div>

      <!-- Charts side by side -->
      <div class="pp-charts">
        <div class="pp-chart-box">
          <h4>Top Bacteria (Latest)</h4>
          <svg #taxaChart></svg>
        </div>
        <div class="pp-chart-box">
          <h4>Profile Radar</h4>
          <div class="pp-radar-center">
            <svg #radarChart></svg>
          </div>
        </div>
      </div>

      <!-- Risk markers -->
      <div class="pp-risks" *ngIf="riskMarkers.length">
        <h4><span class="material-icons" style="color:#fdd835;font-size:18px">warning</span> Observations</h4>
        <div class="pp-risk" *ngFor="let m of riskMarkers">
          <span class="material-icons" style="color:#fdd835;font-size:16px">report_problem</span>
          {{ m }}
        </div>
      </div>

      <!-- Healthy indicator -->
      <div class="pp-healthy" *ngIf="!riskMarkers.length">
        <span class="material-icons" style="color:#66bb6a;font-size:22px">verified</span>
        <span>No significant risk markers. Microbiome appears within healthy parameters.</span>
      </div>
    </div>
  `,
    styles: [`
    .pp-card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;display:flex;
      flex-direction:column;gap:20px}
    .pp-header{display:flex;align-items:center;gap:16px}
    .pp-avatar{width:56px;height:56px;border-radius:50%;background:#0f172a;display:flex;
      align-items:center;justify-content:center;border:3px solid;flex-shrink:0}
    .pp-avatar .material-icons{font-size:28px;color:#94a3b8}
    .pp-info{flex:1}
    .pp-info h2{font-size:22px;color:#e2e8f0;margin:0 0 6px}
    .pp-badge{padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
    .pp-badge--cd{background:rgba(239,83,80,.15);color:#ef5350;border:1px solid rgba(239,83,80,.3)}
    .pp-badge--uc{background:rgba(253,216,53,.15);color:#fdd835;border:1px solid rgba(253,216,53,.3)}
    .pp-badge--nonibd{background:rgba(102,187,106,.15);color:#66bb6a;border:1px solid rgba(102,187,106,.3)}
    .pp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .pp-kpi{background:#0f172a;border-radius:8px;padding:14px;text-align:center;border:1px solid #334155}
    .pp-kpi-val{display:block;font-size:22px;font-weight:700;color:#e2e8f0}
    .pp-kpi-lbl{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
    .pp-kpi-lbl.good{color:#66bb6a}
    .pp-kpi-lbl.bad{color:#ef5350}
    .pp-charts{display:grid;grid-template-columns:1fr auto;gap:16px}
    .pp-chart-box{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;overflow-x:auto}
    .pp-chart-box h4{font-size:13px;color:#94a3b8;margin:0 0 12px;display:flex;align-items:center;gap:6px}
    .pp-radar-center{display:flex;justify-content:center}
    svg{display:block}
    .pp-risks h4{display:flex;align-items:center;gap:6px;font-size:14px;color:#e2e8f0;margin:0 0 10px}
    .pp-risk{display:flex;align-items:flex-start;gap:8px;padding:10px 14px;
      background:rgba(253,216,53,.06);border:1px solid rgba(253,216,53,.15);
      border-radius:8px;font-size:13px;color:#cbd5e1;margin-bottom:6px}
    .pp-healthy{display:flex;align-items:center;gap:10px;padding:14px 18px;
      background:rgba(102,187,106,.06);border:1px solid rgba(102,187,106,.15);
      border-radius:8px;font-size:14px;color:#a5d6a7}
    @media(max-width:768px){.pp-kpis{grid-template-columns:repeat(2,1fr)}.pp-charts{grid-template-columns:1fr}}
  `],
})
export class PatientProfileComponent implements AfterViewInit, OnChanges {
    @Input() result: MicrobiomeResult | null = null;

    @ViewChild('taxaChart') taxaRef!: ElementRef<SVGElement>;
    @ViewChild('radarChart') radarRef!: ElementRef<SVGElement>;

    diagColor = '#94a3b8';
    diRingColor = '#66bb6a';
    diLabel = '';
    circumference = 2 * Math.PI * 38;
    diOffset = 0;
    totalWeeks = 0;
    riskMarkers: string[] = [];

    ngAfterViewInit(): void { this.refresh(); }

    ngOnChanges(ch: SimpleChanges): void {
        if (ch['result'] && this.result) this.refresh();
    }

    private refresh(): void {
        if (!this.result) return;
        this.diagColor = DIAGNOSIS_COLORS[this.result.diagnosis] || '#94a3b8';
        this.totalWeeks = this.result.Dysbiosis_Index.length;

        const di = this.result.Average_Dysbiosis_Index;
        if (di < 2.5) { this.diRingColor = '#66bb6a'; this.diLabel = 'Low'; }
        else if (di < 4) { this.diRingColor = '#fdd835'; this.diLabel = 'Moderate'; }
        else { this.diRingColor = '#ef5350'; this.diLabel = 'High'; }

        const fraction = Math.min(1, di / 6);
        this.diOffset = this.circumference * (1 - fraction);

        // Build risk markers
        this.riskMarkers = [];
        if (di >= 4) this.riskMarkers.push(`High dysbiosis index (${di.toFixed(2)})`);
        else if (di >= 2.5) this.riskMarkers.push(`Moderate dysbiosis index (${di.toFixed(2)})`);
        if (this.result.Good_Bacteria.length < 3) this.riskMarkers.push('Low count of beneficial bacteria detected');
        if (this.result.Bad_Bacteria.length > 5) this.riskMarkers.push('Elevated number of pathogenic taxa');

        this.result.Bad_Bacteria.forEach(b => {
            const latest = b.data.length ? b.data[b.data.length - 1].value : 0;
            if (latest > 0.05) this.riskMarkers.push(`Elevated ${b.name} (${(latest * 100).toFixed(1)}%)`);
        });

        // Check for declining good bacteria
        this.result.Good_Bacteria.forEach(b => {
            if (b.data.length >= 3) {
                const first = b.data[0].value;
                const last = b.data[b.data.length - 1].value;
                if (last < first * 0.5 && first > 0.01) {
                    this.riskMarkers.push(`Declining ${b.name} (${(first * 100).toFixed(1)}% → ${(last * 100).toFixed(1)}%)`);
                }
            }
        });

        setTimeout(() => {
            this.drawTaxa();
            this.drawRadar();
        }, 50);
    }

    private drawTaxa(): void {
        if (!this.taxaRef || !this.result) return;
        const svg = d3.select(this.taxaRef.nativeElement);
        svg.selectAll('*').remove();

        const allBacteria = [
            ...this.result.Good_Bacteria.map(b => ({
                name: b.name,
                val: b.data.length ? b.data[b.data.length - 1].value : 0,
                type: 'good' as const,
            })),
            ...this.result.Bad_Bacteria.map(b => ({
                name: b.name,
                val: b.data.length ? b.data[b.data.length - 1].value : 0,
                type: 'bad' as const,
            })),
        ].sort((a, b) => b.val - a.val).slice(0, 12);

        const w = 380;
        const h = Math.max(200, allBacteria.length * 26 + 20);
        const margin = { top: 4, right: 80, bottom: 4, left: 150 };
        const cw = w - margin.left - margin.right;
        const ch = h - margin.top - margin.bottom;

        svg.attr('width', w).attr('height', h);
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        const x = d3.scaleLinear().domain([0, d3.max(allBacteria, d => d.val)! * 1.15 || 1]).range([0, cw]);
        const y = d3.scaleBand().domain(allBacteria.map(d => d.name)).range([0, ch]).padding(0.22);

        g.selectAll('.bg').data(allBacteria).enter().append('rect')
            .attr('x', 0).attr('y', d => y(d.name)!).attr('width', cw).attr('height', y.bandwidth())
            .attr('fill', '#1e293b').attr('rx', 4);

        g.selectAll('.bar').data(allBacteria).enter().append('rect')
            .attr('x', 0).attr('y', d => y(d.name)!)
            .attr('width', d => x(d.val)).attr('height', y.bandwidth())
            .attr('fill', (d, i) => TAXONOMY_COLORS[i % TAXONOMY_COLORS.length])
            .attr('rx', 4).attr('opacity', 0.85);

        g.selectAll('.dot').data(allBacteria).enter().append('circle')
            .attr('cx', -8).attr('cy', d => y(d.name)! + y.bandwidth() / 2).attr('r', 3)
            .attr('fill', d => d.type === 'good' ? '#66bb6a' : '#ef5350');

        g.selectAll('.lbl').data(allBacteria).enter().append('text')
            .attr('x', -14).attr('y', d => y(d.name)! + y.bandwidth() / 2)
            .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
            .attr('fill', '#cbd5e1').style('font-size', '10px')
            .text(d => d.name.length > 20 ? d.name.slice(0, 20) + '…' : d.name);

        g.selectAll('.vlbl').data(allBacteria).enter().append('text')
            .attr('x', d => x(d.val) + 4).attr('y', d => y(d.name)! + y.bandwidth() / 2)
            .attr('dominant-baseline', 'middle').attr('fill', '#94a3b8')
            .style('font-size', '10px').style('font-weight', '600')
            .text(d => d.val.toFixed(4));
    }

    private drawRadar(): void {
        if (!this.radarRef || !this.result) return;
        const svg = d3.select(this.radarRef.nativeElement);
        svg.selectAll('*').remove();

        const size = 240;
        const radius = size / 2 - 36;
        svg.attr('width', size).attr('height', size);
        const g = svg.append('g').attr('transform', `translate(${size / 2},${size / 2})`);

        const di = this.result.Average_Dysbiosis_Index;
        const nGood = this.result.Good_Bacteria.length;
        const nBad = this.result.Bad_Bacteria.length;
        const nWeeks = this.result.Dysbiosis_Index.length;

        // Normalize metrics to 0-1
        const metrics = [
            { label: 'Dysbiosis', value: Math.min(1, di / 6) },
            { label: 'Good', value: Math.min(1, nGood / 15) },
            { label: 'Bad', value: Math.min(1, nBad / 15) },
            { label: 'Weeks', value: Math.min(1, nWeeks / 30) },
            { label: 'Stability', value: Math.max(0, 1 - (di / 6)) },
        ];

        const angleSlice = (2 * Math.PI) / metrics.length;

        // Grid
        [0.2, 0.4, 0.6, 0.8, 1.0].forEach(lev => {
            g.append('circle').attr('r', radius * lev).attr('fill', 'none')
                .attr('stroke', '#334155').attr('stroke-width', 1);
        });

        // Axes
        metrics.forEach((m, i) => {
            const a = angleSlice * i - Math.PI / 2;
            g.append('line').attr('x1', 0).attr('y1', 0)
                .attr('x2', radius * Math.cos(a)).attr('y2', radius * Math.sin(a))
                .attr('stroke', '#475569');
            g.append('text')
                .attr('x', (radius + 18) * Math.cos(a))
                .attr('y', (radius + 18) * Math.sin(a))
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
                .attr('fill', '#94a3b8').style('font-size', '9px').style('font-weight', '600')
                .text(m.label);
        });

        // Polygon
        const pts = metrics.map((m, i) => ({
            value: Math.max(0, Math.min(1, m.value)), index: i,
        }));

        const lineGen = d3.lineRadial<{ value: number; index: number }>()
            .angle(d => d.index * angleSlice).radius(d => d.value * radius)
            .curve(d3.curveLinearClosed);

        g.append('path').datum(pts)
            .attr('d', lineGen as any)
            .attr('fill', this.diagColor).attr('fill-opacity', 0.2)
            .attr('stroke', this.diagColor).attr('stroke-width', 2);

        pts.forEach(d => {
            const a = d.index * angleSlice - Math.PI / 2;
            g.append('circle')
                .attr('cx', d.value * radius * Math.cos(a))
                .attr('cy', d.value * radius * Math.sin(a))
                .attr('r', 4).attr('fill', this.diagColor).attr('stroke', '#0f172a').attr('stroke-width', 2);
        });
    }
}
