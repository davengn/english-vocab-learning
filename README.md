# Personal English Learning OS — V1

Ứng dụng web học từ vựng và ngữ pháp tiếng Anh cá nhân tối ưu cho người Việt:

**Capture → Understand → Memorize → Practice → Master**

- **Không AI trong V1 (Zero-AI):** 100% logic xác định (deterministic), dữ liệu có cấu trúc, thuật toán lặp lại ngắt quãng SM-2 hai chiều độc lập (`Anh → Việt`, `Việt → Anh`, `Ngữ cảnh`, `Chính tả`), không dùng chatbot hay API AI.
- **Học từ vựng dạng Flashcard kiểu Quizlet:** Mặc định mở bộ thẻ lật 3D trục dọc (`rotateX`), phân loại **Đang học / Đã thuộc**, **Hoàn tác**, **Xáo trộn**, **Gợi ý (`H`)**, **Đổi chiều (`Anh ⇄ Việt`)**, **Tự động lật** và lọc học tiếp các thẻ chưa thuộc.
- **Ngữ pháp đủ 12 thì & 11 dạng bài luyện tập:** Có sẵn 16 danh mục ngữ pháp + đủ **12 thì tiếng Anh** (có thể tự thêm danh mục/chủ điểm), hỗ trợ **11 dạng bài tập** bao gồm **Ghép cụm từ & Chia thì thành câu** (`phrase_conjugation`) và Ngân hàng lỗi sai cá nhân.
- **Giao diện tiếng Việt mặc định:** Hỗ trợ đầy đủ dấu tiếng Việt (`Inter` + `Be Vietnam Pro`), ký tự phiên âm IPA (`Noto Sans`), công thức ngữ pháp (`JetBrains Mono`) và an toàn bộ gõ Telex/VNI (`IME-safe`).
- **PostgreSQL thực thụ:** Mô hình 28 bảng chuẩn quan hệ với Drizzle ORM. Chạy local không cần cài đặt Postgres qua embedded `@electric-sql/pglite` (lưu đĩa `./data/pgdata`), hoặc kết nối PostgreSQL ngoài (Neon, Supabase, Docker) qua `DATABASE_URL`.

---

## Chạy ở máy cá nhân (Zero-Config)

```bash
pnpm install
pnpm dev
```

- Frontend (Vite): `http://localhost:5173`
- Backend API (Hono): `http://localhost:3001`
- Dữ liệu PostgreSQL tự động khởi tạo, migrate và seed ở `./data/pgdata` ngay lần chạy đầu tiên.

### Kiểm thử & Build Production

```bash
pnpm typecheck   # Kiểm tra TypeScript
pnpm test        # Chạy unit tests + integration tests (6 acceptance scenarios)
pnpm build       # Build Vite SPA vào dist/client
pnpm start       # Chạy server production tại http://localhost:3001
```

### Chạy với Docker PostgreSQL (tùy chọn)

```bash
docker compose up -d
DATABASE_URL=postgresql://learner:learner_password@localhost:5432/english_learning_os pnpm dev
```

---

## Triển khai miễn phí All-in-One (Vercel & Netlify)

Xem hướng dẫn từng bước chi tiết cho cả hai nền tảng tại **[docs/DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md)** (tương thích sẵn với `vercel.json` + `api/index.ts` và `netlify.toml` + `netlify/functions/api.ts`).

---

## Tài liệu kiến trúc (Argon Planning)

- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- [docs/VIETNAMESE_LEARNING_UX.md](docs/VIETNAMESE_LEARNING_UX.md)
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)
- [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- [docs/DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md)
