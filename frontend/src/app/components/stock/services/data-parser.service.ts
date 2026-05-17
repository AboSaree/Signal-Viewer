import { Injectable } from '@angular/core';
import { OHLCData, MarketSignal, MultiSignalFile } from '../models/market-data.model';
import * as Papa from 'papaparse';

@Injectable({
    providedIn: 'root'
})
export class DataParserService {

    /**
     * Parse a multi-company CSV file.
     * Expected columns: Name, Date, Open, Close, High, Low, Volume
     * Rows are grouped by company name sequentially.
     */
    parseMultiCompanyCSV(
        file: File,
        category: 'stock' | 'currency' | 'mineral' = 'stock'
    ): Promise<MultiSignalFile> {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
                complete: (results) => {
                    try {
                        const parsed = this.groupByCompany(results.data as any[], category);
                        if (parsed.signals.length === 0) {
                            throw new Error(
                                'No valid data found. Expected columns: Name, Date, Open, Close, High, Low, Volume'
                            );
                        }
                        resolve(parsed);
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    }

    /**
     * Groups raw CSV rows by the "Name" column and builds MarketSignal per company.
     */
    private groupByCompany(rawData: any[], category: 'stock' | 'currency' | 'mineral'): MultiSignalFile {
        const companyMap = new Map<string, OHLCData[]>();

        for (const row of rawData) {
            // Find the Name field
            const nameField = this.findField(row, [
                'name', 'Name', 'NAME', 'symbol', 'Symbol', 'SYMBOL',
                'ticker', 'Ticker', 'TICKER', 'company', 'Company', 'COMPANY'
            ]);

            if (!nameField || !row[nameField]) continue;

            const companyName = String(row[nameField]).trim().toUpperCase();

            // Parse the OHLC row — note: CSV order is Name, Date, Open, Close, High, Low, Volume
            const ohlc = this.parseRow(row);
            if (!ohlc) continue;

            if (!companyMap.has(companyName)) {
                companyMap.set(companyName, []);
            }
            companyMap.get(companyName)!.push(ohlc);
        }

        const companies: string[] = [];
        const signals: MarketSignal[] = [];

        companyMap.forEach((data, name) => {
            const sorted = this.sortByDate(data);
            companies.push(name);
            signals.push({ name, category, data: sorted });
        });

        return { companies, signals };
    }

    /**
     * Parse a single CSV row into OHLCData.
     * Handles the column order: Name, Date, Open, Close, High, Low, Volume
     */
    private parseRow(row: any): OHLCData | null {
        const dateField = this.findField(row, [
            'date', 'Date', 'DATE', 'time', 'Time', 'TIME',
            'timestamp', 'Timestamp', 'TIMESTAMP', 'datetime', 'DateTime'
        ]);
        const openField = this.findField(row, ['open', 'Open', 'OPEN', 'o', 'O']);
        const closeField = this.findField(row, [
            'close', 'Close', 'CLOSE', 'c', 'C', 'adj close', 'Adj Close'
        ]);
        const highField = this.findField(row, ['high', 'High', 'HIGH', 'h', 'H']);
        const lowField = this.findField(row, ['low', 'Low', 'LOW', 'l', 'L']);
        const volumeField = this.findField(row, [
            'volume', 'Volume', 'VOLUME', 'vol', 'Vol', 'VOL', 'v', 'V'
        ]);

        if (!dateField || !openField || !closeField) {
            return null;
        }

        const time = this.normalizeDate(row[dateField]);
        if (!time) return null;

        const open = parseFloat(row[openField]);
        const close = parseFloat(row[closeField]);
        const high = highField ? parseFloat(row[highField]) : Math.max(open, close);
        const low = lowField ? parseFloat(row[lowField]) : Math.min(open, close);
        const volume = volumeField ? parseFloat(row[volumeField]) || 0 : 0;

        if (isNaN(open) || isNaN(close)) return null;

        return {
            time,
            open,
            high: isNaN(high) ? Math.max(open, close) : high,
            low: isNaN(low) ? Math.min(open, close) : low,
            close,
            volume
        };
    }

    private findField(row: any, possibleNames: string[]): string | null {
        const keys = Object.keys(row);
        for (const name of possibleNames) {
            const found = keys.find(k => k.trim().toLowerCase() === name.toLowerCase());
            if (found) return found;
        }
        return null;
    }

    private normalizeDate(dateStr: string): string | null {
        if (!dateStr) return null;
        try {
            // Handle various date formats
            const cleaned = String(dateStr).trim();

            // Try direct parse
            let date = new Date(cleaned);

            // Handle DD/MM/YYYY or DD-MM-YYYY
            if (isNaN(date.getTime())) {
                const parts = cleaned.split(/[\/\-\.]/);
                if (parts.length === 3) {
                    // Try MM/DD/YYYY
                    date = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
                    if (isNaN(date.getTime())) {
                        // Try DD/MM/YYYY
                        date = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                    }
                }
            }

            if (isNaN(date.getTime())) return null;

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch {
            return null;
        }
    }

    private sortByDate(data: OHLCData[]): OHLCData[] {
        return data.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }

    /**
     * Legacy: Parse a single-company CSV (kept for backward compatibility)
     */
    parseCSV(file: File, category: 'stock' | 'currency' | 'mineral'): Promise<MarketSignal> {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
                complete: (results) => {
                    try {
                        const rows = results.data as any[];
                        const data: OHLCData[] = rows
                            .map(row => this.parseRow(row))
                            .filter((item): item is OHLCData => item !== null);

                        resolve({
                            name: file.name.replace(/\.[^/.]+$/, '').toUpperCase(),
                            category,
                            data: this.sortByDate(data)
                        });
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error) => reject(error)
            });
        });
    }

    /**
     * Auto-detect: if a Name/Symbol column exists, treat as multi-company.
     * Otherwise, treat as single-company.
     */
    parseFile(
        file: File,
        category: 'stock' | 'currency' | 'mineral'
    ): Promise<MultiSignalFile> {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: false,
                preview: 3, // Peek at first 3 rows to detect format
                complete: (preview) => {
                    const sampleRow = preview.data[0] as any;
                    if (!sampleRow) {
                        reject(new Error('File is empty or has no valid headers.'));
                        return;
                    }

                    const keys = Object.keys(sampleRow);
                    const hasNameColumn = keys.some(k =>
                        ['name', 'symbol', 'ticker', 'company'].includes(k.trim().toLowerCase())
                    );

                    if (hasNameColumn) {
                        // Multi-company file
                        this.parseMultiCompanyCSV(file, category).then(resolve).catch(reject);
                    } else {
                        // Single-company file — wrap in MultiSignalFile
                        this.parseCSV(file, category).then(signal => {
                            resolve({
                                companies: [signal.name],
                                signals: [signal]
                            });
                        }).catch(reject);
                    }
                },
                error: (error) => reject(error)
            });
        });
    }

    /**
     * Generate sample multi-company data for demo
     */
    generateSampleMultiData(): MultiSignalFile {
        const names = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'];
        const signals: MarketSignal[] = [];
        const companies: string[] = [];

        for (const name of names) {
            const signal = this.generateSampleData(name, 'stock', 200 + Math.floor(Math.random() * 200));
            signals.push(signal);
            companies.push(name);
        }

        return { companies, signals };
    }

    /**
     * Generate sample data for a single company
     */
    generateSampleData(
        name: string,
        category: 'stock' | 'currency' | 'mineral',
        days: number = 365
    ): MarketSignal {
        const data: OHLCData[] = [];
        let basePrice = category === 'stock'
            ? 50 + Math.random() * 200
            : category === 'currency'
                ? 1.1
                : 1800;
        const volatility = category === 'stock' ? 0.03 : category === 'currency' ? 0.005 : 0.02;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);

            if (category === 'stock' && (date.getDay() === 0 || date.getDay() === 6)) {
                continue;
            }

            const changePercent = (Math.random() - 0.48) * volatility;
            const open = basePrice;
            const close = open * (1 + changePercent);
            const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
            const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
            const volume = Math.floor(Math.random() * 50000000) + 10000000;

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');

            data.push({
                time: `${year}-${month}-${day}`,
                open: parseFloat(open.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat(close.toFixed(2)),
                volume
            });

            basePrice = close;
        }

        return { name, category, data };
    }
}
