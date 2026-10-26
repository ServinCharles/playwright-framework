import { test, expect } from '@playwright/test';
import { bestThreshold, type ScoredPair } from '../../ai/eval/semantic-calibrate';

// Synthetic scores for testing the maths only. These are not real labels.
const pair = (label: 'same' | 'different', score: number): ScoredPair => ({
  id: `${label}-${score}`,
  reference: 'r',
  reply: 'p',
  label,
  score,
});

test.describe('Semantic threshold calibration', () => {
  test('finds a threshold that separates clean same and different pairs @critical', () => {
    const result = bestThreshold([
      pair('same', 0.9),
      pair('same', 0.7),
      pair('different', 0.2),
      pair('different', 0.3),
    ]);
    expect(result?.accuracy).toBe(1);
    expect(result?.lowestSame).toBe(0.7);
    expect(result?.highestDifferent).toBe(0.3);
    expect(result!.threshold).toBeGreaterThan(0.3);
    expect(result!.threshold).toBeLessThanOrEqual(0.7);
  });

  test('reports the best accuracy when the classes overlap', () => {
    const result = bestThreshold([
      pair('same', 0.5),
      pair('different', 0.6),
      pair('same', 0.8),
      pair('different', 0.1),
    ]);
    expect(result!.accuracy).toBeCloseTo(0.75);
  });

  test('no labelled pairs means nothing to calibrate', () => {
    expect(bestThreshold([])).toBeUndefined();
  });
});
