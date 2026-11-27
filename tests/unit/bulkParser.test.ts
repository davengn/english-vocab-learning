import { describe, expect, it } from 'vitest';
import { parseBulkVocabulary } from '../../src/shared/bulkParser.js';

describe('parseBulkVocabulary', () => {
  it('returns empty results for blank or whitespace-only input', () => {
    expect(parseBulkVocabulary('')).toEqual({
      rows: [],
      totalNonEmptyLines: 0,
      duplicateInBatchCount: 0,
      incompleteCount: 0,
    });

    expect(parseBulkVocabulary('\n  \r\n\t\n')).toEqual({
      rows: [],
      totalNonEmptyLines: 0,
      duplicateInBatchCount: 0,
      incompleteCount: 0,
    });
  });

  it('parses tab-separated lines', () => {
    const result = parseBulkVocabulary('meticulous\ttỉ mỉ, cẩn thận');

    expect(result.totalNonEmptyLines).toBe(1);
    expect(result.incompleteCount).toBe(0);
    expect(result.duplicateInBatchCount).toBe(0);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 1,
      word: 'meticulous',
      normalizedWord: 'meticulous',
      vietnameseMeaning: 'tỉ mỉ, cẩn thận',
      ipa: '',
      exampleSentence: '',
      exampleTranslation: '',
      isDuplicateInBatch: false,
      isIncomplete: false,
      delimiterUsed: 'tab',
    });
  });

  it('parses pipe-separated lines with example sentence and translation', () => {
    const result = parseBulkVocabulary(
      'ubiquitous | có mặt ở khắp nơi | Smartphones have become ubiquitous in modern life. | Điện thoại thông minh đã trở nên phổ biến khắp nơi trong đời sống hiện đại.',
    );

    expect(result.rows[0]).toMatchObject({
      word: 'ubiquitous',
      vietnameseMeaning: 'có mặt ở khắp nơi',
      ipa: '',
      exampleSentence: 'Smartphones have become ubiquitous in modern life.',
      exampleTranslation:
        'Điện thoại thông minh đã trở nên phổ biến khắp nơi trong đời sống hiện đại.',
      isIncomplete: false,
      delimiterUsed: 'pipe',
    });
  });

  it('parses dash-separated, colon-separated, and multi-space lines', () => {
    const input = [
      'pragmatic - thực tế, thực dụng',
      'resilient : kiên cường, mau hồi phục',
      'eloquent: hùng biện, lưu loát',
      'ambiguous    mơ hồ, tối nghĩa',
    ].join('\n');

    const result = parseBulkVocabulary(input);

    expect(result.totalNonEmptyLines).toBe(4);
    expect(result.rows[0]).toMatchObject({
      word: 'pragmatic',
      vietnameseMeaning: 'thực tế, thực dụng',
      delimiterUsed: 'dash',
      isIncomplete: false,
    });
    expect(result.rows[1]).toMatchObject({
      word: 'resilient',
      vietnameseMeaning: 'kiên cường, mau hồi phục',
      delimiterUsed: 'colon',
      isIncomplete: false,
    });
    expect(result.rows[2]).toMatchObject({
      word: 'eloquent',
      vietnameseMeaning: 'hùng biện, lưu loát',
      delimiterUsed: 'colon',
      isIncomplete: false,
    });
    expect(result.rows[3]).toMatchObject({
      word: 'ambiguous',
      vietnameseMeaning: 'mơ hồ, tối nghĩa',
      delimiterUsed: 'tab',
      isIncomplete: false,
    });
  });

  it('extracts optional IPA when placed in column 2 or column 3 alongside example sentence', () => {
    const ipaInCol2 = parseBulkVocabulary(
      'meticulous\t/məˈtɪk.jə.ləs/\ttỉ mỉ, cẩn thận\tShe keeps meticulous records.',
    );
    expect(ipaInCol2.rows[0]).toMatchObject({
      word: 'meticulous',
      ipa: '/məˈtɪk.jə.ləs/',
      vietnameseMeaning: 'tỉ mỉ, cẩn thận',
      exampleSentence: 'She keeps meticulous records.',
      isIncomplete: false,
    });

    const ipaInCol3 = parseBulkVocabulary(
      'meticulous | tỉ mỉ, cẩn thận | /məˈtɪk.jə.ləs/ | She keeps meticulous records.',
    );
    expect(ipaInCol3.rows[0]).toMatchObject({
      word: 'meticulous',
      vietnameseMeaning: 'tỉ mỉ, cẩn thận',
      ipa: '/məˈtɪk.jə.ləs/',
      exampleSentence: 'She keeps meticulous records.',
      isIncomplete: false,
    });
  });

  it('marks single-word lines as incomplete drafts without failing', () => {
    const result = parseBulkVocabulary('ephemeral\nalacrity\t/əˈlæk.rə.ti/');

    expect(result.totalNonEmptyLines).toBe(2);
    expect(result.incompleteCount).toBe(2);

    expect(result.rows[0]).toMatchObject({
      word: 'ephemeral',
      vietnameseMeaning: '',
      isIncomplete: true,
      delimiterUsed: 'single',
    });

    expect(result.rows[1]).toMatchObject({
      word: 'alacrity',
      ipa: '/əˈlæk.rə.ti/',
      vietnameseMeaning: '',
      isIncomplete: true,
      delimiterUsed: 'tab',
    });
  });

  it('parses a 20-word batch preserving Vietnamese diacritics, detecting batch duplicates, and ignoring empty lines', () => {
    const twentyWordBatch = [
      'meticulous\ttỉ mỉ, cẩn thận',
      '',
      'resilient\tkiên cường, vững vàng',
      '   ',
      'ambiguous - mơ hồ, lưỡng nghĩa',
      'pragmatic\tthực tế, hiệu quả',
      'mitigate\tgiảm nhẹ, làm dịu bớt',
      'sustainable\tbền vững, lâu dài',
      'prerequisite\tđiều kiện tiên quyết',
      'lucrative\tsinh lợi, béo bở',
      'scrutinize\txem xét kỹ lưỡng',
      'proficient\tthành thạo, vững tay nghề',
      'deteriorate\ttrở nên tệ hơn, xuống cấp',
      'endeavor\tnỗ lực, cố gắng hết sức',
      'alleviate\txoa dịu, làm nhẹ gánh nặng',
      'foster\tnuôi dưỡng, thúc đẩy sự phát triển',
      'coherent\tmạch lạc, chặt chẽ',
      'perseverance\tsự kiên trì, bền bỉ',
      'contemplate\tsuy ngẫm, cân nhắc kỹ lưỡng',
      'Meticulous\t(trùng lặp chữ hoa)',
      '  sustainable  - (trùng lặp khoảng trắng)',
      'ephemeral',
    ].join('\r\n');

    const result = parseBulkVocabulary(twentyWordBatch);

    // 22 lines total minus 2 blank/whitespace-only lines = 20 non-empty lines
    expect(result.totalNonEmptyLines).toBe(20);
    expect(result.rows).toHaveLength(20);
    expect(result.duplicateInBatchCount).toBe(2);
    expect(result.incompleteCount).toBe(1);

    // Empty lines are skipped, while original 1-based line numbers are preserved
    expect(result.rows[0]?.rowNumber).toBe(1);
    expect(result.rows[1]?.rowNumber).toBe(3);
    expect(result.rows[2]?.rowNumber).toBe(5);

    // Preserves complex Vietnamese diacritics: ữ, ệ, ợ, ằ
    expect(result.rows[1]?.vietnameseMeaning).toContain('vững');
    expect(result.rows[4]?.vietnameseMeaning).toContain('nhẹ');
    expect(result.rows[6]?.vietnameseMeaning).toContain('kiện');
    expect(result.rows[7]?.vietnameseMeaning).toContain('lợi');
    expect(result.rows[8]?.vietnameseMeaning).toContain('lưỡng');
    expect(result.rows[10]?.vietnameseMeaning).toContain('tệ');
    expect(result.rows[11]?.vietnameseMeaning).toContain('lực');

    // Also explicitly verify words containing 'ằ' and 'ợ' in NFC form
    const diacriticCheck = parseBulkVocabulary('anchor\tbằng phẳng, hợp lý, vững chãi, lệ thuộc');
    expect(diacriticCheck.rows[0]?.vietnameseMeaning).toBe('bằng phẳng, hợp lý, vững chãi, lệ thuộc');
    expect(diacriticCheck.rows[0]?.vietnameseMeaning).toContain('ằ');
    expect(diacriticCheck.rows[0]?.vietnameseMeaning).toContain('ợ');
    expect(diacriticCheck.rows[0]?.vietnameseMeaning).toContain('ữ');
    expect(diacriticCheck.rows[0]?.vietnameseMeaning).toContain('ệ');

    // Duplicate detection is case- and whitespace-normalized
    expect(result.rows[0]?.isDuplicateInBatch).toBe(false);
    expect(result.rows[17]).toMatchObject({
      word: 'Meticulous',
      normalizedWord: 'meticulous',
      isDuplicateInBatch: true,
    });
    expect(result.rows[18]).toMatchObject({
      word: 'sustainable',
      normalizedWord: 'sustainable',
      isDuplicateInBatch: true,
    });

    // Final single word is saved as incomplete draft
    expect(result.rows[19]).toMatchObject({
      word: 'ephemeral',
      isIncomplete: true,
      isDuplicateInBatch: false,
    });
  });

  it('normalizes NFD decomposed Vietnamese text to NFC', () => {
    const nfdVietnamese = 'b\u0061\u0306\u0300ng ch\u01b0\u0303ng'; // "bằng chữ..." decomposed
    const result = parseBulkVocabulary(`evidence\t${nfdVietnamese}`);

    expect(result.rows[0]?.vietnameseMeaning).toBe(nfdVietnamese.normalize('NFC'));
  });
});
