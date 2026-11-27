import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import {
  generateVocabularyCsv,
  type ExportableVocabularyRow,
} from '../../src/shared/csvExport.js';

function makeExportRow(
  overrides: Partial<ExportableVocabularyRow> = {},
): ExportableVocabularyRow {
  return {
    word: 'meticulous',
    ipa: '/məˈtɪk.jə.ləs/',
    partOfSpeech: 'adjective',
    cefrLevel: 'C1',
    vietnameseMeaning: 'tỉ mỉ, cẩn thận',
    englishDefinition: 'showing great attention to detail',
    vietnameseExplanation: 'Chỉ sự cẩn trọng từng chi tiết nhỏ',
    register: 'formal',
    tone: 'positive',
    usageContext: 'Academic writing, professional feedback',
    vnCommonMistakes: 'Hay nhầm với careful',
    examplesText: 'She is meticulous about keeping records.',
    collocationsText: 'meticulous planning; meticulous attention to detail',
    collectionsText: 'IELTS Writing',
    tagsText: 'c1; academic',
    status: 'reviewing',
    confidenceLevel: 4,
    source: 'IELTS Reading',
    ...overrides,
  };
}

describe('generateVocabularyCsv', () => {
  it('starts with UTF-8 BOM (\\uFEFF) and emits RFC 4180 headers with CRLF line endings', () => {
    const emptyCsv = generateVocabularyCsv([]);

    expect(emptyCsv.startsWith('\uFEFF')).toBe(true);
    expect(emptyCsv.slice(1)).toBe(
      'Word,IPA,Part of Speech,CEFR,Vietnamese Meaning,English Definition,Vietnamese Explanation,Register,Tone,Usage Context,Vietnamese Common Mistakes,Examples,Collocations,Collections,Tags,Status,Confidence,Source',
    );
  });

  it('preserves Vietnamese diacritics (ữ, ệ, ợ, ằ) and IPA glyphs', () => {
    const csv = generateVocabularyCsv([
      makeExportRow({
        word: 'indispensable',
        ipa: '/ˌɪn.dɪˈspɛn.sə.bəl/',
        vietnameseMeaning: 'không thể thiếu được',
        vietnameseExplanation: 'Vững vàng, bằng chứng, lệ thuộc, hợp lý, chọn lựa',
      }),
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('/ˌɪn.dɪˈspɛn.sə.bəl/');
    expect(csv).toContain('không thể thiếu được');
    expect(csv).toContain('Vững vàng, bằng chứng, lệ thuộc, hợp lý, chọn lựa');
    expect(csv).toContain('ữ');
    expect(csv).toContain('ệ');
    expect(csv).toContain('ợ');
    expect(csv).toContain('ằ');
  });

  it('escapes commas, double quotes (""), and embedded newlines per RFC 4180', () => {
    const row = makeExportRow({
      word: 'eloquent',
      ipa: '/ˈɛl.ə.kwənt/',
      vietnameseMeaning: 'hùng biện, lưu loát',
      englishDefinition: 'fluent or persuasive in "speaking" or writing',
      examplesText: 'Line 1: She gave an "eloquent" speech.\nLine 2: Everyone applauded, loudly.',
      usageContext: 'Public speaking\r\nDebates, presentations',
    });

    const csv = generateVocabularyCsv([row]);
    const withoutBom = csv.slice(1);
    const lines = withoutBom.split('\r\n');

    expect(lines[0]).toMatch(/^Word,IPA,Part of Speech,/);
    expect(csv).toContain('"hùng biện, lưu loát"');
    expect(csv).toContain('"fluent or persuasive in ""speaking"" or writing"');
    expect(csv).toContain(
      '"Line 1: She gave an ""eloquent"" speech.\nLine 2: Everyone applauded, loudly."',
    );
    expect(csv).toContain('"Public speaking\r\nDebates, presentations"');

    // Verify RFC 4180 round-trip integrity with papaparse after stripping BOM
    const parsed = Papa.parse<Record<string, string>>(withoutBom, {
      header: true,
      skipEmptyLines: false,
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]).toMatchObject({
      Word: 'eloquent',
      IPA: '/ˈɛl.ə.kwənt/',
      'Vietnamese Meaning': 'hùng biện, lưu loát',
      'English Definition': 'fluent or persuasive in "speaking" or writing',
      Examples: 'Line 1: She gave an "eloquent" speech.\nLine 2: Everyone applauded, loudly.',
      'Usage Context': 'Public speaking\r\nDebates, presentations',
      Confidence: '4',
    });
  });
});
