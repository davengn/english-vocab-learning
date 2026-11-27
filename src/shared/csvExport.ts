export interface ExportableVocabularyRow {
  word: string;
  ipa: string;
  partOfSpeech: string;
  cefrLevel: string;
  vietnameseMeaning: string;
  englishDefinition: string;
  vietnameseExplanation: string;
  register: string;
  tone: string;
  usageContext: string;
  vnCommonMistakes: string;
  examplesText: string;
  collocationsText: string;
  collectionsText: string;
  tagsText: string;
  status: string;
  confidenceLevel: number;
  source: string;
}

function escapeCsvField(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates RFC 4180 CSV with UTF-8 BOM so Excel preserves Vietnamese diacritics and IPA.
 */
export function generateVocabularyCsv(rows: ExportableVocabularyRow[]): string {
  const headers = [
    'Word',
    'IPA',
    'Part of Speech',
    'CEFR',
    'Vietnamese Meaning',
    'English Definition',
    'Vietnamese Explanation',
    'Register',
    'Tone',
    'Usage Context',
    'Vietnamese Common Mistakes',
    'Examples',
    'Collocations',
    'Collections',
    'Tags',
    'Status',
    'Confidence',
    'Source',
  ];

  const lines = [headers.map(escapeCsvField).join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.word,
        row.ipa,
        row.partOfSpeech,
        row.cefrLevel,
        row.vietnameseMeaning,
        row.englishDefinition,
        row.vietnameseExplanation,
        row.register,
        row.tone,
        row.usageContext,
        row.vnCommonMistakes,
        row.examplesText,
        row.collocationsText,
        row.collectionsText,
        row.tagsText,
        row.status,
        row.confidenceLevel,
        row.source,
      ]
        .map(escapeCsvField)
        .join(','),
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}
