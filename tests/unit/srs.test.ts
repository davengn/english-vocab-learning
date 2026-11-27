import { describe, expect, it } from 'vitest';
import {
  buildDailyTargetCap,
  calculateSm2,
  computeWordMasteryStatus,
  roundEase,
  scoreReviewPriority,
  type Sm2StateInput,
} from '../../src/shared/srs.js';

const FIXED_NOW = new Date('2026-11-26T09:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeState(overrides: Partial<Sm2StateInput> = {}): Sm2StateInput {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    status: 'new',
    ...overrides,
  };
}

describe('roundEase', () => {
  it('clamps ease factor between 1.3 and 3.0 and rounds to 2 decimals', () => {
    expect(roundEase(1.1)).toBe(1.3);
    expect(roundEase(3.25)).toBe(3.0);
    expect(roundEase(2.345)).toBe(2.35);
    expect(roundEase(2.5)).toBe(2.5);
  });
});

describe('calculateSm2', () => {
  describe('Rating 1 (Again / Quên)', () => {
    it('resets repetitions to 0, increments lapses, sets interval to 1 day, and lowers ease factor', () => {
      const result = calculateSm2(
        makeState({
          easeFactor: 2.5,
          intervalDays: 21,
          repetitions: 4,
          lapses: 1,
          status: 'mastered',
        }),
        1,
        FIXED_NOW,
      );

      expect(result.repetitions).toBe(0);
      expect(result.lapses).toBe(2);
      expect(result.intervalDays).toBe(1);
      expect(result.easeFactor).toBe(2.3);
      expect(result.status).toBe('learning');
      expect(result.lastRating).toBe(1);
      expect(result.lastReviewedAt).toEqual(FIXED_NOW);
      expect(result.nextReviewAt).toEqual(new Date(FIXED_NOW.getTime() + MS_PER_DAY));
    });

    it('never drops ease factor below the 1.3 floor', () => {
      const nearFloor = calculateSm2(makeState({ easeFactor: 1.4, repetitions: 2 }), 1, FIXED_NOW);
      expect(nearFloor.easeFactor).toBe(1.3);

      const atFloor = calculateSm2(makeState({ easeFactor: 1.3, repetitions: 1 }), 1, FIXED_NOW);
      expect(atFloor.easeFactor).toBe(1.3);
    });
  });

  describe('Rating 2 (Hard / Khó)', () => {
    it('sets repetitions to 1 and interval to 1 day on first repetition', () => {
      const result = calculateSm2(makeState(), 2, FIXED_NOW);

      expect(result.repetitions).toBe(1);
      expect(result.intervalDays).toBe(1);
      expect(result.easeFactor).toBe(2.35);
      expect(result.status).toBe('learning');
      expect(result.lapses).toBe(0);
    });

    it('preserves repetitions >= 1, scales interval by 1.2x, decreases easeFactor by 0.15, and sets status to learning', () => {
      const result = calculateSm2(
        makeState({
          easeFactor: 2.5,
          intervalDays: 10,
          repetitions: 3,
          lapses: 0,
          status: 'review',
        }),
        2,
        FIXED_NOW,
      );

      expect(result.repetitions).toBe(3);
      expect(result.intervalDays).toBe(12);
      expect(result.easeFactor).toBe(2.35);
      expect(result.status).toBe('learning');
      expect(result.nextReviewAt).toEqual(new Date(FIXED_NOW.getTime() + 12 * MS_PER_DAY));
    });

    it('floors easeFactor at 1.3 even after repeated Hard ratings', () => {
      const result = calculateSm2(
        makeState({ easeFactor: 1.35, intervalDays: 4, repetitions: 2, status: 'learning' }),
        2,
        FIXED_NOW,
      );

      expect(result.easeFactor).toBe(1.3);
    });
  });

  describe('Rating 3 (Good / Nhớ)', () => {
    it('progresses 1d -> 6d -> round(6 * EF) and promotes to mastered when reps >= 3, interval >= 21, and EF >= 2.2', () => {
      const rep1 = calculateSm2(makeState({ easeFactor: 2.5 }), 3, FIXED_NOW);
      expect(rep1.repetitions).toBe(1);
      expect(rep1.intervalDays).toBe(1);
      expect(rep1.easeFactor).toBe(2.5);
      expect(rep1.status).toBe('review');

      const rep2 = calculateSm2(
        makeState({
          easeFactor: rep1.easeFactor,
          intervalDays: rep1.intervalDays,
          repetitions: rep1.repetitions,
          status: rep1.status,
        }),
        3,
        FIXED_NOW,
      );
      expect(rep2.repetitions).toBe(2);
      expect(rep2.intervalDays).toBe(6);
      expect(rep2.easeFactor).toBe(2.5);
      expect(rep2.status).toBe('review');

      const rep3 = calculateSm2(
        makeState({
          easeFactor: rep2.easeFactor,
          intervalDays: rep2.intervalDays,
          repetitions: rep2.repetitions,
          status: rep2.status,
        }),
        3,
        FIXED_NOW,
      );
      expect(rep3.repetitions).toBe(3);
      expect(rep3.intervalDays).toBe(15); // round(6 * 2.5)
      expect(rep3.status).toBe('review'); // 15 < 21

      const rep4 = calculateSm2(
        makeState({
          easeFactor: rep3.easeFactor,
          intervalDays: rep3.intervalDays,
          repetitions: rep3.repetitions,
          status: rep3.status,
        }),
        3,
        FIXED_NOW,
      );
      expect(rep4.repetitions).toBe(4);
      expect(rep4.intervalDays).toBe(38); // round(15 * 2.5)
      expect(rep4.status).toBe('mastered');
      expect(rep4.nextReviewAt).toEqual(new Date(FIXED_NOW.getTime() + 38 * MS_PER_DAY));
    });

    it('promotes on rep 3 when interval reaches >= 21 and EF >= 2.2', () => {
      const result = calculateSm2(
        makeState({ easeFactor: 2.4, intervalDays: 9, repetitions: 2, status: 'review' }),
        3,
        FIXED_NOW,
      );

      expect(result.repetitions).toBe(3);
      expect(result.intervalDays).toBe(22); // round(9 * 2.4)
      expect(result.easeFactor).toBe(2.4);
      expect(result.status).toBe('mastered');
    });

    it('keeps status at review instead of mastered when EF < 2.2 even if interval >= 21 and reps >= 3', () => {
      const result = calculateSm2(
        makeState({ easeFactor: 2.1, intervalDays: 12, repetitions: 2, status: 'review' }),
        3,
        FIXED_NOW,
      );

      expect(result.repetitions).toBe(3);
      expect(result.intervalDays).toBe(25);
      expect(result.easeFactor).toBe(2.1);
      expect(result.status).toBe('review');
    });
  });

  describe('Rating 4 (Easy / Rất dễ)', () => {
    it('gives 4d on rep 1, expands intervals on later reps, and caps ease factor at 3.0', () => {
      const rep1 = calculateSm2(makeState({ easeFactor: 2.5 }), 4, FIXED_NOW);
      expect(rep1.repetitions).toBe(1);
      expect(rep1.intervalDays).toBe(4);
      expect(rep1.easeFactor).toBe(2.65);
      expect(rep1.status).toBe('review');
      expect(rep1.nextReviewAt).toEqual(new Date(FIXED_NOW.getTime() + 4 * MS_PER_DAY));

      const rep2 = calculateSm2(
        makeState({
          easeFactor: rep1.easeFactor,
          intervalDays: rep1.intervalDays,
          repetitions: rep1.repetitions,
          status: rep1.status,
        }),
        4,
        FIXED_NOW,
      );
      expect(rep2.repetitions).toBe(2);
      expect(rep2.intervalDays).toBe(8);
      expect(rep2.easeFactor).toBe(2.8);
      expect(rep2.status).toBe('review');

      const rep3 = calculateSm2(
        makeState({
          easeFactor: rep2.easeFactor,
          intervalDays: rep2.intervalDays,
          repetitions: rep2.repetitions,
          status: rep2.status,
        }),
        4,
        FIXED_NOW,
      );
      expect(rep3.repetitions).toBe(3);
      expect(rep3.intervalDays).toBe(29); // round(8 * 2.8 * 1.3)
      expect(rep3.easeFactor).toBe(2.95);
      expect(rep3.status).toBe('mastered');

      const rep4 = calculateSm2(
        makeState({
          easeFactor: rep3.easeFactor,
          intervalDays: rep3.intervalDays,
          repetitions: rep3.repetitions,
          status: rep3.status,
        }),
        4,
        FIXED_NOW,
      );
      expect(rep4.easeFactor).toBe(3.0);
    });

    it('keeps ease factor capped at 3.0 when already at 3.0', () => {
      const result = calculateSm2(
        makeState({ easeFactor: 3.0, intervalDays: 30, repetitions: 4, status: 'mastered' }),
        4,
        FIXED_NOW,
      );

      expect(result.easeFactor).toBe(3.0);
      expect(result.status).toBe('mastered');
    });
  });
});

describe('computeWordMasteryStatus', () => {
  it('returns new when states array is empty or all directions are unstarted', () => {
    expect(computeWordMasteryStatus([])).toBe('new');
    expect(
      computeWordMasteryStatus([
        { skillDirection: 'en_to_vi', status: 'new', repetitions: 0, lapses: 0 },
        { skillDirection: 'vi_to_en', status: 'new', repetitions: 0, lapses: 0 },
      ]),
    ).toBe('new');
  });

  it('returns learning when at least one direction is learning or has a lapse/repetition', () => {
    expect(
      computeWordMasteryStatus([
        { skillDirection: 'en_to_vi', status: 'learning', repetitions: 1, lapses: 0 },
        { skillDirection: 'vi_to_en', status: 'new', repetitions: 0, lapses: 0 },
      ]),
    ).toBe('learning');

    expect(
      computeWordMasteryStatus([
        { skillDirection: 'en_to_vi', status: 'new', repetitions: 0, lapses: 1 },
        { skillDirection: 'vi_to_en', status: 'new', repetitions: 0, lapses: 0 },
      ]),
    ).toBe('learning');
  });

  it('returns reviewing when at least one direction is in review or repetitions >= 2 without both mastered', () => {
    expect(
      computeWordMasteryStatus([
        { skillDirection: 'en_to_vi', status: 'review', repetitions: 2, lapses: 0 },
        { skillDirection: 'vi_to_en', status: 'learning', repetitions: 1, lapses: 0 },
      ]),
    ).toBe('reviewing');
  });

  it('returns reviewing (not mastered) when only en_to_vi is mastered and vi_to_en is still learning', () => {
    expect(
      computeWordMasteryStatus([
        { skillDirection: 'en_to_vi', status: 'mastered', repetitions: 4, lapses: 0 },
        { skillDirection: 'vi_to_en', status: 'learning', repetitions: 1, lapses: 1 },
      ]),
    ).toBe('reviewing');
  });

  it('returns reviewing when only vi_to_en is mastered and en_to_vi is still new or review', () => {
    expect(
      computeWordMasteryStatus([
        { skillDirection: 'en_to_vi', status: 'review', repetitions: 2, lapses: 0 },
        { skillDirection: 'vi_to_en', status: 'mastered', repetitions: 3, lapses: 0 },
      ]),
    ).toBe('reviewing');
  });

  it('returns mastered only when BOTH en_to_vi and vi_to_en are mastered', () => {
    expect(
      computeWordMasteryStatus([
        { skillDirection: 'en_to_vi', status: 'mastered', repetitions: 4, lapses: 0 },
        { skillDirection: 'vi_to_en', status: 'mastered', repetitions: 3, lapses: 0 },
        { skillDirection: 'context', status: 'learning', repetitions: 1, lapses: 0 },
      ]),
    ).toBe('mastered');
  });
});

describe('scoreReviewPriority', () => {
  it('ranks overdue, high-lapse, low-confidence, confusing cards much higher than well-known future cards', () => {
    const troubledOverdueCard = scoreReviewPriority({
      nextReviewAt: new Date(FIXED_NOW.getTime() - 10 * MS_PER_DAY),
      lapses: 4,
      confidenceLevel: 1,
      easeFactor: 1.5,
      isConfusing: true,
      now: FIXED_NOW,
    });

    const wellKnownFutureCard = scoreReviewPriority({
      nextReviewAt: new Date(FIXED_NOW.getTime() + 14 * MS_PER_DAY),
      lapses: 0,
      confidenceLevel: 5,
      easeFactor: 2.8,
      isConfusing: false,
      now: FIXED_NOW,
    });

    // Troubled: 10*3 (30) + 4*6 (24) + (5-1)*4 (16) + (2.5-1.5)*10 (10) + 8 = 88
    expect(troubledOverdueCard).toBe(88);
    expect(wellKnownFutureCard).toBe(0);
    expect(troubledOverdueCard).toBeGreaterThan(wellKnownFutureCard);
  });

  it('supports ISO string dates and caps overdue bonus at 30 days', () => {
    const thirtyDaysOverdue = scoreReviewPriority({
      nextReviewAt: new Date(FIXED_NOW.getTime() - 30 * MS_PER_DAY).toISOString(),
      lapses: 0,
      confidenceLevel: 5,
      easeFactor: 2.5,
      now: FIXED_NOW,
    });

    const sixtyDaysOverdue = scoreReviewPriority({
      nextReviewAt: new Date(FIXED_NOW.getTime() - 60 * MS_PER_DAY).toISOString(),
      lapses: 0,
      confidenceLevel: 5,
      easeFactor: 2.5,
      now: FIXED_NOW,
    });

    expect(thirtyDaysOverdue).toBe(90);
    expect(sixtyDaysOverdue).toBe(90);
  });
});

describe('buildDailyTargetCap', () => {
  it('returns full dueCount and isOverloaded: false when backlog is within target capacity', () => {
    // 15 minutes => capacity 20 cards (15 * 60 / 45 = 20)
    expect(buildDailyTargetCap(12, 15)).toEqual({
      recommendedCount: 12,
      isOverloaded: false,
    });
    expect(buildDailyTargetCap(0, 15)).toEqual({
      recommendedCount: 0,
      isOverloaded: false,
    });
  });

  it('marks isOverloaded: true only when dueCount strictly exceeds 2x capacity and caps recommendedCount', () => {
    // 15 minutes => capacity 20, 2x capacity = 40
    expect(buildDailyTargetCap(40, 15)).toEqual({
      recommendedCount: 20,
      isOverloaded: false,
    });

    expect(buildDailyTargetCap(41, 15)).toEqual({
      recommendedCount: 20,
      isOverloaded: true,
    });

    expect(buildDailyTargetCap(150, 15)).toEqual({
      recommendedCount: 20,
      isOverloaded: true,
    });
  });

  it('clamps targetMinutes to [5, 240] and keeps minimum capacity at 8 cards', () => {
    // 1 minute clamps to 5 => round(300 / 45) = 7 => min capacity 8
    expect(buildDailyTargetCap(25, 1)).toEqual({
      recommendedCount: 8,
      isOverloaded: true,
    });

    // 300 minutes clamps to 240 => (240 * 60) / 45 = 320
    expect(buildDailyTargetCap(400, 300)).toEqual({
      recommendedCount: 320,
      isOverloaded: false,
    });
  });
});
