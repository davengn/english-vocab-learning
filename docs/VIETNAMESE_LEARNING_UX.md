# VIETNAMESE_LEARNING_UX.md — Vietnamese-First Learning Experience Design

## 1. Language Architecture

- **Primary Interface Language**: Natural, concise **Vietnamese** (`vi`) for all navigation, page titles, filters, buttons, form labels, validation errors, empty states, and analytics insights.
- **Target Content Language**: **English** for vocabulary headwords, collocations, grammar topic titles (paired with Vietnamese subtitles), formulas, and English example sentences.
- **Bilingual Pairing Rule**: Whenever an English term or grammar concept appears, its Vietnamese meaning or explanation is immediately visible or one-step expandable without cluttering reading flow.

---

## 2. Typography & Diacritic / IPA Fidelity

Vietnamese stacked diacritics (e.g., `ữ`, `ệ`, `ợ`, `ằ`, `ẩ`, `ẫ`) and International Phonetic Alphabet glyphs (`/ˌmɛt.ɪk.jʊ.ləs/`, `/ˈʃɛdjuːl/`, `ˈ`, `ˌ`, `ː`, `θ`, `ð`, `ʃ`, `ʒ`, `ŋ`, `ə`, `æ`, `ɔː`) often clip or fall back to mismatched system fonts if a single generic font is used.

- **UI & Vietnamese Prose**: `Inter` paired with `Be Vietnam Pro` (`line-height >= 1.55` for body prose, generous vertical rhythm so stacked accents never collide with adjacent lines or table borders).
- **IPA Phonetics (`.ipa`)**: Dedicated `Noto Sans` stack with explicit Unicode support for all IPA symbols, displayed in muted slate-ink inside `/` delimiters.
- **Formulas & Shortcuts (`.formula`)**: `JetBrains Mono` for grammar formulas (`S + have/has + V3/ed`) and keyboard hints (`⌘K`, `Space`, `1–4`).
- **Unicode Normalization**: Input search and comparisons apply Unicode `NFC` normalization alongside trimmed lowercase normalization (`normalizedWord`) so composed vs. decomposed Vietnamese diacritics (common on macOS) match consistently.

---

## 3. Vietnamese Input Method Editor (IME) Safety

Vietnamese users type with Telex, VNI, or macOS native Vietnamese IMEs where the `Enter` / `Return` key or character composition buffers can fire `keydown` events while text is still being composed.

- **Mandatory IME Guard**: Every custom `Enter` shortcut (Quick Add vocabulary, search inputs, inline editors, practice answer submission, command palette) **must** check:
  `event.nativeEvent.isComposing || event.keyCode === 229`
  before acting on `Enter`, preventing accidental submission of half-composed Vietnamese words (e.g., `tieengs`).

---

## 4. Bidirectional Recall Asymmetry (Recognition vs. Active Production)

Vietnamese learners frequently recognize English words when reading (`Anh → Việt`) yet fail to produce the exact English word or collocation when speaking or writing (`Việt → Anh`).

- **Independent Skill Tracking**: `vocabulary_review_states` stores separate SM-2 schedules per `skillDirection`:
  - `en_to_vi` (Nhận diện nghĩa)
  - `vi_to_en` (Nhớ chủ động)
  - `context` (Ngữ cảnh sử dụng)
  - `spelling` (Chính tả)
- **Bidirectional Mastery Gate**: A word is marked `mastered` (`Đã thành thạo`) only when **both** `en_to_vi` and `vi_to_en` reach mastery thresholds—preventing false confidence from passive recognition alone.
- **Analytics Transparency**: The Dashboard and Analytics screens explicitly contrast `Nhận diện (Anh → Việt)` accuracy vs. `Nhớ chủ động (Việt → Anh)` accuracy.

---

## 5. Vietnamese Learner Interference & Mistake Taxonomy

Vietnamese is an isolating, non-inflected language without tense morphology, grammatical articles, or plural suffixes. The UX explicitly models these interference patterns:

1. **Vocabulary Record — "Ghi chú cho người Việt"**:
   - `Lỗi thường gặp` (Common mistakes)
   - `Kết hợp từ sai` (Incorrect word combinations — e.g., *study knowledge* instead of *acquire knowledge*)
   - `Từ dễ nhầm lẫn` (Confusing similar words — *affect/effect*, *economic/economical*)
   - `Bẫy dịch Anh–Việt` (Direct Vietnamese-to-English translation traps — e.g., translating *"rất thích"* as *"very like"*)
2. **Grammar Explanation Structure**:
   - Every grammar lesson breaks down **Là gì (What)** · **Tại sao dùng (Why)** · **Khi nào dùng (When)** · **Dấu hiệu nhận biết (How to recognize)** in Vietnamese alongside **Lỗi người Việt hay gặp** (`incorrect` vs `corrected`).
3. **Personal Mistake Bank Categories**:
   - `Lỗi chia thì` (`tense`)
   - `Hòa hợp chủ - vị` (`subject_verb_agreement`)
   - `Mạo từ (a/an/the)` (`articles`)
   - `Giới từ` (`prepositions`)
   - `Trật tự từ` (`word_order`)
   - `Số ít / Số nhiều` (`pluralization`)
   - `Dạng động từ (V-ing / to-V / V3)` (`verb_forms`)
   - `Dịch sát nghĩa Việt → Anh` (`vn_direct_translation`)
   - `Dùng sai từ / Collocation` (`vocabulary_usage`)

---

## 6. Non-Punitive Motivation & Break Recovery

- Missing review days never resets progress to zero or shames the learner.
- If a learner returns after a break and overdue items exceed 2× their daily target, `Ôn tập hôm nay` displays a calm **"Chào mừng quay lại — đã chia nhẹ hàng đợi theo mục tiêu hôm nay"** notice and prioritizes the highest-impact overdue, high-lapse, and confusing items within the selected daily minute budget (5 / 10 / 15 / 20 / custom).
