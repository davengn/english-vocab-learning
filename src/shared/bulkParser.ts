import { normalizeUnicode, normalizeWord } from './schemas.js';

export interface ParsedBulkRow {
  rowNumber: number;
  rawLine: string;
  word: string;
  normalizedWord: string;
  vietnameseMeaning: string;
  ipa: string;
  exampleSentence: string;
  exampleTranslation: string;
  isDuplicateInBatch: boolean;
  isIncomplete: boolean;
  delimiterUsed: 'tab' | 'pipe' | 'dash' | 'colon' | 'single';
}

export interface BulkParseResult {
  rows: ParsedBulkRow[];
  totalNonEmptyLines: number;
  duplicateInBatchCount: number;
  incompleteCount: number;
}

function splitDeterministicColumns(line: string): {
  parts: string[];
  delimiterUsed: ParsedBulkRow['delimiterUsed'];
} {
  if (line.includes('\t')) {
    return {
      parts: line.split('\t').map((p) => p.trim()),
      delimiterUsed: 'tab',
    };
  }
  if (line.includes(' | ')) {
    return {
      parts: line.split(' | ').map((p) => p.trim()),
      delimiterUsed: 'pipe',
    };
  }
  if (line.includes(' - ')) {
    return {
      parts: line.split(' - ').map((p) => p.trim()),
      delimiterUsed: 'dash',
    };
  }
  if (line.includes(' : ')) {
    return {
      parts: line.split(' : ').map((p) => p.trim()),
      delimiterUsed: 'colon',
    };
  }
  // Support compact colon syntax only when not an IPA-only or URL pattern
  const colonIdx = line.indexOf(':');
  if (colonIdx > 0 && !line.includes('://')) {
    return {
      parts: [line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim()],
      delimiterUsed: 'colon',
    };
  }

  // Multi-space separation (4+ spaces often copied from spreadsheets/PDFs)
  if (/\s{3,}/.test(line)) {
    return {
      parts: line.split(/\s{3,}/).map((p) => p.trim()),
      delimiterUsed: 'tab',
    };
  }

  return {
    parts: [line.trim()],
    delimiterUsed: 'single',
  };
}

function looksLikeIpa(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('/') && trimmed.endsWith('/') && trimmed.length >= 3;
}

/**
 * Deterministic bulk vocabulary parser (Zero AI).
 * Supports:
 * - word \t vietnameseMeaning [\t ipa_or_example] [\t example_or_translation]
 * - word - vietnameseMeaning
 * - word : vietnameseMeaning
 * - word | vietnameseMeaning | example | translation
 * - single word (saved as incomplete entry so learner can enrich later)
 */
export function parseBulkVocabulary(rawText: string): BulkParseResult {
  const lines = rawText.split(/\r?\n/);
  const seen = new Set<string>();
  const rows: ParsedBulkRow[] = [];

  let duplicateInBatchCount = 0;
  let incompleteCount = 0;
  let nonEmptyIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = normalizeUnicode(lines[i] ?? '');
    if (!rawLine) continue;

    nonEmptyIdx += 1;
    const { parts, delimiterUsed } = splitDeterministicColumns(rawLine);
    const word = (parts[0] ?? '').trim();
    if (!word) continue;

    const normalized = normalizeWord(word);
    const isDuplicateInBatch = seen.has(normalized);
    if (isDuplicateInBatch) {
      duplicateInBatchCount += 1;
    } else {
      seen.add(normalized);
    }

    let vietnameseMeaning = '';
    let ipa = '';
    let exampleSentence = '';
    let exampleTranslation = '';

    if (parts.length >= 2) {
      const col2 = parts[1] ?? '';
      const col3 = parts[2] ?? '';
      const col4 = parts[3] ?? '';

      if (looksLikeIpa(col2)) {
        ipa = col2;
        vietnameseMeaning = col3;
        exampleSentence = col4;
      } else {
        vietnameseMeaning = col2;
        if (looksLikeIpa(col3)) {
          ipa = col3;
          exampleSentence = col4;
        } else {
          exampleSentence = col3;
          exampleTranslation = col4;
        }
      }
    }

    const isIncomplete = vietnameseMeaning.trim().length === 0;
    if (isIncomplete) {
      incompleteCount += 1;
    }

    rows.push({
      rowNumber: i + 1,
      rawLine,
      word,
      normalizedWord: normalized,
      vietnameseMeaning: vietnameseMeaning.trim(),
      ipa: ipa.trim(),
      exampleSentence: exampleSentence.trim(),
      exampleTranslation: exampleTranslation.trim(),
      isDuplicateInBatch,
      isIncomplete,
      delimiterUsed,
    });
  }

  return {
    rows,
    totalNonEmptyLines: nonEmptyIdx,
    duplicateInBatchCount,
    incompleteCount,
  };
}
