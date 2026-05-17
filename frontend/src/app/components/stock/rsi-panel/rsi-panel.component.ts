import { Component, Input } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

@Component({
  standalone: true,
  imports: [CommonModule, DecimalPipe],
    selector: 'app-stock-rsi-panel',
    templateUrl: './rsi-panel.component.html',
    styleUrls: ['./rsi-panel.component.css']
})
export class StockRsiPanelComponent {
    @Input() rsiValue: number | undefined;

    getRSIColor(): string {
        if (!this.rsiValue) return '#888';
        if (this.rsiValue >= 70) return '#ef5350';
        if (this.rsiValue <= 30) return '#26a69a';
        return '#ff9800';
    }

    getRSILabel(): string {
        if (!this.rsiValue) return '';
        if (this.rsiValue >= 70) return 'Overbought';
        if (this.rsiValue <= 30) return 'Oversold';
        return 'Neutral';
    }
}
