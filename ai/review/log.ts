import fs from 'fs';
import path from 'path';

export type ReviewEvent = 'generated' | 'accepted' | 'edited' | 'rejected';

export interface LogRow {
  date: string;
  event: ReviewEvent;
  file: string;
  provider: string;
  reviewer: string;
  notes: string;
}

const HEADER = 'date,event,file,provider,reviewer,notes';
const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export const DEFAULT_LOG = path.resolve(__dirname, '../review-log.csv');

export function appendLog(row: LogRow, logFile = DEFAULT_LOG): void {
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, HEADER + '\n');
  const line = [row.date, row.event, row.file, row.provider, row.reviewer, row.notes]
    .map(quote)
    .join(',');
  fs.appendFileSync(logFile, line + '\n');
}

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && inQuotes && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function readLog(logFile = DEFAULT_LOG): LogRow[] {
  if (!fs.existsSync(logFile)) return [];
  return fs
    .readFileSync(logFile, 'utf-8')
    .split('\n')
    .slice(1)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [date, event, file, provider, reviewer, notes] = parseLine(line);
      return { date, event: event as ReviewEvent, file, provider, reviewer, notes };
    });
}

export interface Stats {
  generated: number;
  accepted: number;
  edited: number;
  rejected: number;
  pending: number;
  acceptanceRate: number;
  editRate: number;
  rejectionRate: number;
}

export function computeStats(rows: LogRow[]): Stats {
  const count = (event: ReviewEvent): number => rows.filter((r) => r.event === event).length;
  const generated = count('generated');
  const accepted = count('accepted');
  const edited = count('edited');
  const rejected = count('rejected');
  const reviewed = accepted + edited + rejected;
  const rate = (n: number): number => (reviewed === 0 ? 0 : n / reviewed);
  return {
    generated,
    accepted,
    edited,
    rejected,
    pending: Math.max(0, generated - reviewed),
    acceptanceRate: rate(accepted),
    editRate: rate(edited),
    rejectionRate: rate(rejected),
  };
}
