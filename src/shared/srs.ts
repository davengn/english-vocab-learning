export type Sm2Rating = 1 | 2 | 3 | 4; // 1: Quên (Again), 2: Khó (Hard), 3: Nhớ (Good), 4: Rất dễ (Easy)
export type ReviewStatus = 'new' | 'learning' | 'review' | 'mastered';
export type VocabMasteryStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface Sm2StateInput {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  status: ReviewStatus;
}

export interface Sm2StateOutput {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  status: ReviewStatus;
  lastRating: Sm2Rating;
  lastReviewedAt: Date;
  nextReviewAt: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function roundEase(ef: number): number {
  return Math.round(Math.min(3.0, Math.max(1.3, ef)) * 100) / 100;
}

/**
 * Deterministic SM-2 spaced repetition calculation.
 * Tracks each recall direction independently.
 */
export function calculateSm2(
  current: Sm2StateInput,
  rating: Sm2Rating,
  now = new Date(),
): Sm2StateOutput {
  const prevEf = current.easeFactor || 2.5;
  const prevInterval = current.intervalDays || 0;
  const prevReps = current.repetitions || 0;
  const prevLapses = current.lapses || 0;

  let easeFactor = prevEf;
  let intervalDays = prevInterval;
  let repetitions = prevReps;
  let lapses = prevLapses;
  let status: ReviewStatus = current.status;

  if (rating === 1) {
    // Again / Quên
    repetitions = 0;
    lapses = prevLapses + 1;
    intervalDays = 1;
    easeFactor = roundEase(prevEf - 0.2);
    status = 'learning';
  } else if (rating === 2) {
    // Hard / Khó
    repetitions = Math.max(1, prevReps);
    intervalDays = prevReps === 0 ? 1 : Math.max(1, Math.round(prevInterval * 1.2));
    easeFactor = roundEase(prevEf - 0.15);
    status = 'learning';
  } else if (rating === 3) {
    // Good / Nhớ
    repetitions = prevReps + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(1, Math.round(prevInterval * prevEf));
    }
    easeFactor = roundEase(prevEf);
    status = intervalDays >= 21 && repetitions >= 3 && easeFactor >= 2.2 ? 'mastered' : 'review';
  } else {
    // Easy / Rất dễ (4)
    repetitions = prevReps + 1;
    if (repetitions === 1) {
      intervalDays = 4;
    } else if (repetitions === 2) {
      intervalDays = Math.max(6, Math.round(6 * 1.3));
    } else {
      intervalDays = Math.max(1, Math.round(prevInterval * prevEf * 1.3));
    }
    easeFactor = roundEase(prevEf + 0.15);
    status = intervalDays >= 21 && repetitions >= 3 ? 'mastered' : 'review';
  }

  const nextReviewAt = new Date(now.getTime() + intervalDays * MS_PER_DAY);

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    status,
    lastRating: rating,
    lastReviewedAt: now,
    nextReviewAt,
  };
}

/**
 * Bidirectional mastery check:
 * A vocabulary item reaches 'mastered' only when both passive recognition (en_to_vi)
 * and active recall (vi_to_en) reach 'mastered'.
 */
export function computeWordMasteryStatus(
  states: Array<{ skillDirection: string; status: ReviewStatus; repetitions: number; lapses: number }>,
): VocabMasteryStatus {
  if (states.length === 0) return 'new';

  const enToVi = states.find((s) => s.skillDirection === 'en_to_vi');
  const viToEn = states.find((s) => s.skillDirection === 'vi_to_en');

  if (enToVi?.status === 'mastered' && viToEn?.status === 'mastered') {
    return 'mastered';
  }

  if (states.some((s) => s.status === 'review' || s.status === 'mastered' || s.repetitions >= 2)) {
    return 'reviewing';
  }

  if (states.some((s) => s.status === 'learning' || s.repetitions >= 1 || s.lapses >= 1)) {
    return 'learning';
  }

  return 'new';
}

export interface PriorityInput {
  nextReviewAt: Date | string;
  lapses: number;
  confidenceLevel: number;
  easeFactor: number;
  isConfusing?: boolean;
  now?: Date;
}

/**
 * Deterministic priority score for daily review ordering.
 * Higher score = surfaced earlier in the daily queue.
 */
export function scoreReviewPriority(input: PriorityInput): number {
  const now = input.now ?? new Date();
  const dueDate =
    input.nextReviewAt instanceof Date ? input.nextReviewAt : new Date(input.nextReviewAt);
  const overdueDays = Math.max(0, (now.getTime() - dueDate.getTime()) / MS_PER_DAY);

  const overdueScore = Math.min(overdueDays, 30) * 3;
  const lapseScore = input.lapses * 6;
  const lowConfidenceScore = Math.max(0, 5 - input.confidenceLevel) * 4;
  const difficultyScore = Math.max(0, (2.5 - input.easeFactor) * 10);
  const confusingBonus = input.isConfusing ? 8 : 0;

  return Math.round((overdueScore + lapseScore + lowConfidenceScore + difficultyScore + confusingBonus) * 100) / 100;
}

/**
 * Computes a calm, non-punitive daily item budget based on user's target minutes.
 * Assumes ~45 seconds per active review card on average.
 */
export function buildDailyTargetCap(dueCount: number, targetMinutes: number): {
  recommendedCount: number;
  isOverloaded: boolean;
} {
  const safeMinutes = Math.max(5, Math.min(240, targetMinutes));
  const capacity = Math.max(8, Math.round((safeMinutes * 60) / 45));
  return {
    recommendedCount: Math.min(dueCount, capacity),
    isOverloaded: dueCount > capacity * 2,
  };
}
