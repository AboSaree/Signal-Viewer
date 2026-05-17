import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataParserService } from '../services/data-parser.service';
import { MultiSignalFile } from '../models/market-data.model';

@Component({
  selector: 'app-stock-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.css']
})
export class StockUploadComponent {
  @Output() fileLoaded = new EventEmitter<MultiSignalFile>();

  selectedCategory: 'stock' | 'currency' | 'mineral' = 'stock';
  isDragging = false;
  isLoading = false;
  errorMessage = '';
  fileName = '';

  categories: { value: 'stock' | 'currency' | 'mineral'; label: string; icon: string; description: string }[] = [
    { value: 'stock',    label: 'Stock Market',              icon: '📈', description: 'Equities, shares, and stock exchange data (e.g., AAPL, GOOGL, MSFT)' },
    { value: 'currency', label: 'Foreign Exchange (Forex)',  icon: '💱', description: 'Currency pairs and exchange rates (e.g., EUR/USD, GBP/JPY, USD/CHF)' },
    { value: 'mineral',  label: 'Commodities & Minerals',   icon: '⛏️', description: 'Precious metals and raw materials (e.g., Gold XAU, Silver XAG, Copper, Oil)' }
  ];

  formatHints: Record<string, { nameExample: string; columns: string }> = {
    stock:    { nameExample: 'AAPL, GOOGL, TSLA',            columns: 'Name, Date, Open, Close, High, Low, Volume' },
    currency: { nameExample: 'EUR/USD, GBP/JPY, USD/CHF',   columns: 'Name, Date, Open, Close, High, Low, Volume' },
    mineral:  { nameExample: 'GOLD, SILVER, OIL, COPPER',   columns: 'Name, Date, Open, Close, High, Low, Volume' }
  };

  sampleRows: Record<string, { name: string; date: string; open: string; close: string; high: string; low: string; vol: string }[]> = {
    stock: [
      { name: 'AAPL',  date: '2024-01-02', open: '185.50', close: '186.20', high: '186.75', low: '184.25', vol: '55,000,000' },
      { name: 'AAPL',  date: '2024-01-03', open: '186.00', close: '185.50', high: '187.50', low: '185.00', vol: '48,000,000' },
      { name: 'GOOGL', date: '2024-01-02', open: '140.20', close: '141.80', high: '142.50', low: '139.75', vol: '32,000,000' }
    ],
    currency: [
      { name: 'EUR/USD', date: '2024-01-02', open: '1.1045', close: '1.1062', high: '1.1078', low: '1.1030', vol: '85,200' },
      { name: 'EUR/USD', date: '2024-01-03', open: '1.1060', close: '1.1038', high: '1.1075', low: '1.1020', vol: '79,400' },
      { name: 'GBP/JPY', date: '2024-01-02', open: '184.25', close: '184.80', high: '185.10', low: '183.90', vol: '42,100' }
    ],
    mineral: [
      { name: 'GOLD',   date: '2024-01-02', open: '2062.50', close: '2071.80', high: '2078.40', low: '2055.20', vol: '182,500' },
      { name: 'GOLD',   date: '2024-01-03', open: '2070.00', close: '2058.90', high: '2075.60', low: '2050.10', vol: '195,300' },
      { name: 'SILVER', date: '2024-01-02', open: '24.15',   close: '24.52',   high: '24.68',   low: '23.95',   vol: '65,800' }
    ]
  };

  constructor(private dataParser: DataParserService) {}

  getCurrentHint()       { return this.formatHints[this.selectedCategory]; }
  getCurrentSampleRows() { return this.sampleRows[this.selectedCategory]; }

  onDragOver(e: DragEvent): void  { e.preventDefault(); e.stopPropagation(); this.isDragging = true; }
  onDragLeave(e: DragEvent): void { e.preventDefault(); e.stopPropagation(); this.isDragging = false; }

  async onDrop(e: DragEvent): Promise<void> {
    e.preventDefault(); e.stopPropagation();
    this.isDragging = false;
    const files = e.dataTransfer?.files;
    if (files?.length) await this.processFile(files[0]);
  }

  async onFileSelected(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) await this.processFile(input.files[0]);
  }

  async processFile(file: File): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    this.fileName = file.name;
    try {
      const result = await this.dataParser.parseFile(file, this.selectedCategory);
      if (result.signals.length === 0) throw new Error('No valid data found. Check columns: Name, Date, Open, Close, High, Low, Volume');
      this.fileLoaded.emit(result);
    } catch (error: any) {
      this.errorMessage = error.message || 'Failed to parse file.';
    } finally {
      this.isLoading = false;
    }
  }

  loadSampleData(): void {
    this.fileLoaded.emit(this.dataParser.generateSampleMultiData());
  }
}
