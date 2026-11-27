import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Merges conditional class names with Tailwind conflict resolution.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

function parseDateInput(isoOrDate: string | Date): { date: Date; isDateOnly: boolean } | null {
  if (isoOrDate instanceof Date) {
    return Number.isNaN(isoOrDate.getTime()) ? null : { date: isoOrDate, isDateOnly: false };
  }

  const trimmed = isoOrDate.trim();
  const dateOnlyMatch = DATE_ONLY_RE.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const localDate = new Date(year, month - 1, day);
    if (
      localDate.getFullYear() !== year ||
      localDate.getMonth() !== month - 1 ||
      localDate.getDate() !== day
    ) {
      return null;
    }
    return { date: localDate, isDateOnly: true };
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : { date: parsed, isDateOnly: false };
}

/**
 * Formats an ISO string, YYYY-MM-DD date string, or Date as DD/MM/YYYY (e.g. 26/11/2026).
 */
export function formatDateVi(isoOrDate: string | Date): string {
  const parsed = parseDateInput(isoOrDate);
  if (!parsed) return '';

  const { date } = parsed;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formats an SRS review due timestamp or YYYY-MM-DD date in calm Vietnamese relative phrasing.
 */
export function formatRelativeDueVi(iso: string | Date, now = new Date()): string {
  const parsed = parseDateInput(iso);
  if (!parsed) return '—';

  const { date, isDateOnly } = parsed;

  if (isDateOnly) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((date.getTime() - todayStart) / MS_PER_DAY);
    if (diffDays === 0) return 'Đến hạn ngay';
    if (diffDays < 0) return `Quá hạn ${Math.abs(diffDays)} ngày`;
    return `Còn ${diffDays} ngày`;
  }

  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) {
    const overdueDays = Math.floor(Math.abs(diffMs) / MS_PER_DAY);
    if (overdueDays === 0) return 'Đến hạn ngay';
    return `Quá hạn ${overdueDays} ngày`;
  }

  const remainingHours = diffMs / (60 * 60 * 1000);
  if (remainingHours < 1) return 'Sắp đến hạn';
  if (remainingHours < 12) return 'Còn vài giờ';

  const remainingDays = Math.max(1, Math.round(diffMs / MS_PER_DAY));
  return `Còn ${remainingDays} ngày`;
}

/**
 * Deterministically splits a sentence into highlighted and plain segments for a target word/phrase.
 * Case-insensitive with Unicode word-boundary guards; avoids HTML injection.
 */
export function highlightTargetWord(sentence: string, target: string): HighlightSegment[] {
  if (!sentence) return [];
  const trimmed = target.trim();
  if (!trimmed) return [{ text: sentence, highlighted: false }];

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'giu');
  const requireStartBoundary = WORD_CHAR_RE.test(trimmed[0]);
  const requireEndBoundary = WORD_CHAR_RE.test(trimmed[trimmed.length - 1]);

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const match of sentence.matchAll(regex)) {
    const start = match.index ?? 0;
    const matchedText = match[0];
    const end = start + matchedText.length;

    const prevChar = start > 0 ? sentence[start - 1] : '';
    const nextChar = end < sentence.length ? sentence[end] : '';

    if (requireStartBoundary && prevChar && WORD_CHAR_RE.test(prevChar)) {
      continue;
    }
    if (requireEndBoundary && nextChar && WORD_CHAR_RE.test(nextChar)) {
      continue;
    }

    if (start > cursor) {
      segments.push({ text: sentence.slice(cursor, start), highlighted: false });
    }
    segments.push({ text: matchedText, highlighted: true });
    cursor = end;
  }

  if (cursor < sentence.length) {
    segments.push({ text: sentence.slice(cursor), highlighted: false });
  }

  return segments.length > 0 ? segments : [{ text: sentence, highlighted: false }];
}

/**
 * Returns true if any native modal `<dialog open>` is currently displayed.
 * Used to isolate background keyboard shortcuts from active modals.
 */
export function hasOpenDialog(): boolean {
  return typeof document !== 'undefined' && Boolean(document.querySelector('dialog[open]'));
}

/**
 * Returns true when keyboard focus is inside an editable form control or contentEditable region.
 */
export function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
}

/**
 * Returns true when focus is on another interactive control (button/link/tab)
 * rather than the allowed card container itself, preventing Space shortcuts from hijacking buttons.
 */
export function isOtherInteractiveFocused(allowedElement?: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || active === document.documentElement) return false;
  if (allowedElement && active === allowedElement) return false;
  const tag = active.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return true;
  const role = active.getAttribute('role');
  return role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab';
}
