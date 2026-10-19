import { computeStats, readLog } from './log';

const stats = computeStats(readLog());
const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

console.table({
  generated: stats.generated,
  pending_review: stats.pending,
  accepted: stats.accepted,
  edited: stats.edited,
  rejected: stats.rejected,
  acceptance_rate: pct(stats.acceptanceRate),
  edit_rate: pct(stats.editRate),
  rejection_rate: pct(stats.rejectionRate),
});
