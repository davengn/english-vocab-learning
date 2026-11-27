# Hướng dẫn Deploy Miễn phí All-in-One (Vercel & Netlify)

Ứng dụng **Personal English Learning OS — V1** đã cấu hình sẵn cả backend Hono (`/api/*`), frontend Vite SPA (`dist/client`) và Drizzle ORM cho PostgreSQL. Khi đưa lên cloud, bạn **chỉ cần gắn biến môi trường `DATABASE_URL`** tới một PostgreSQL miễn phí (không cần sửa code): ứng dụng sẽ tự chạy toàn bộ SQL migration trong `drizzle/` và tự seed dữ liệu khởi tạo ở lần request đầu tiên.

---

## So sánh nhanh để chọn nền tảng

| Tiêu chí | Vercel + Neon (Vercel Storage) | Netlify + Netlify DB / Neon |
|---|---|---|
| **Chi phí** | Miễn phí (Hobby plan + Neon Free) | Miễn phí (Starter plan + Netlify DB / Neon Free) |
| **Quản lý All-in-One** | Rất gọn: tạo DB ngay trong tab **Storage** của project Vercel, tự gắn `DATABASE_URL` | Rất gọn: hỗ trợ **Netlify DB** hoặc gắn `DATABASE_URL` từ Neon/Supabase |
| **File cấu hình sẵn** | `vercel.json` + `api/[...route].ts` | `netlify.toml` + `netlify/functions/api.ts` |
| **Gói build** | `pnpm build` (tự động) | `pnpm build` (tự động) |
| **Độ trễ / Trải nghiệm** | Cold start nhanh, CDN toàn cầu | Cold start nhanh, CDN toàn cầu |
| **Khuyên dùng** | **Ưu tiên #1** nếu muốn 1-click DB + Deploy nhanh nhất | Tốt ngang nhau nếu bạn quen hệ sinh thái Netlify |

> **Lưu ý quan trọng:** Trên môi trường Serverless (Vercel / Netlify), filesystem cục bộ không giữ file qua các lần deploy, nên **bắt buộc phải gắn `DATABASE_URL`** trỏ tới PostgreSQL bên ngoài (Neon / Supabase). Khi chạy trên máy cá nhân không có `DATABASE_URL`, ứng dụng tự dùng PGlite lưu vào `./data/pgdata`.

---

## Phương án 1: Deploy lên Vercel (Khuyên dùng)

### Bước 1: Import Repository lên Vercel
1. Truy cập https://vercel.com/new và đăng nhập bằng tài khoản GitHub **`davengn`**.
2. Chọn repository của dự án (`english-vocab-learning` hoặc tên repo bạn vừa push) → bấm **Import**.
3. Kiểm tra **Build & Output Settings** (Vercel tự đọc từ `vercel.json`):
   - **Framework Preset:** Other (hoặc Vite)
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist/client`
4. Tạm bấm **Deploy** (hoặc tạo DB trước ở Bước 2 rồi Redeploy).

### Bước 2: Gắn PostgreSQL miễn phí All-in-One & Biến bảo mật ngay trong Vercel
1. Trong Project vừa tạo trên Vercel, mở tab **Storage** → **Create Database** → chọn **Neon** (*Serverless Postgres*, gói Free).
2. Đặt tên database (ví dụ `english-learning-os`) → chọn Region gần nhất (Singapore `ap-southeast-1`) → bấm **Create**.
3. Bấm **Connect Project** để Vercel tự bơm biến `DATABASE_URL` vào Environment Variables (`Production`, `Preview`, `Development`).
4. Vào **Settings → Environment Variables**, thêm biến `AUTH_SECRET` là một chuỗi ngẫu nhiên dài (ví dụ chạy `openssl rand -hex 32` trên máy cá nhân để lấy chuỗi) để ký cookie đăng nhập an toàn tuyệt đối. *(Tùy chọn: có thể thêm `AUTH_USERNAME` / `AUTH_PASSWORD_HASH` nếu muốn đổi tài khoản mặc định.)*
5. Vào tab **Deployments** → chọn bản deploy mới nhất → bấm **⋮ → Redeploy** để áp dụng cấu hình mới.

*(Hoặc nếu dùng PostgreSQL bên ngoài như Supabase / Neon tự tạo: vào **Settings → Environment Variables**, thêm `DATABASE_URL = postgresql://...` rồi Redeploy.)*

### Deploy bằng Vercel CLI (tùy chọn)
```bash
npm i -g vercel
vercel login
vercel link
vercel env add DATABASE_URL
vercel --prod
```

---

## Phương án 2: Deploy lên Netlify

### Bước 1: Import Repository lên Netlify
1. Truy cập https://app.netlify.com → **Add new site → Import an existing project → GitHub**.
2. Chọn repository của dự án.
3. Netlify tự đọc `netlify.toml`:
   - **Build command:** `pnpm build`
   - **Publish directory:** `dist/client`
   - **Functions directory:** `netlify/functions`

### Bước 2: Gắn PostgreSQL miễn phí (`DATABASE_URL`) & `AUTH_SECRET`
Bạn có 2 cách nhanh cho DB:
- **Cách A — Dùng Netlify DB (All-in-One):** Trong dashboard site Netlify, mở mục **Netlify DB / Extensions → Neon** để khởi tạo Postgres miễn phí gắn thẳng vào site.
- **Cách B — Dùng Neon / Supabase miễn phí:**
  1. Tạo project miễn phí tại https://neon.tech (chọn region Singapore) và copy chuỗi kết nối `postgres://...?sslmode=require`.
  2. Trên Netlify, vào **Site configuration → Environment variables → Add a variable**:
     - **Key:** `DATABASE_URL`
     - **Value:** `<chuỗi kết nối Neon/Supabase>`
3. Đồng thời thêm biến môi trường `AUTH_SECRET` (chuỗi ngẫu nhiên dài 32+ ký tự, ví dụ từ `openssl rand -hex 32`) để ký session cookie đăng nhập.
4. Mở tab **Deploys → Trigger deploy → Clear cache and deploy site**.

### Deploy bằng Netlify CLI (tùy chọn)
```bash
npm i -g netlify-cli
netlify login
netlify init
netlify env:set DATABASE_URL "postgresql://..."
netlify deploy --prod
```

---

## Kiểm tra sau khi Deploy thành công

Sau khi nhận được URL production (ví dụ `https://<site>.vercel.app` hoặc `https://<site>.netlify.app`), hãy kiểm tra nhanh 4 điểm sau:

1. Mở `https://<domain>/api/health` → trả về `{"ok":true,"status":"healthy","driver":"pg",...}` (chú ý `driver` là `"pg"` nghĩa là đã kết nối thành công tới PostgreSQL thật!).
2. Truy cập trang chủ `https://<domain>/` → hiển thị màn hình **Đăng nhập hệ thống**; thử đăng nhập bằng tài khoản cá nhân đã cấu hình.
3. Mở `/vocabulary` → thấy bộ thẻ **Flashcard kiểu Quizlet** kèm 12 từ mẫu.
4. Mở `/grammar` → nhóm **Các thì trong tiếng Anh** có đủ **12 thì**, và mục **Luyện tập → Luyện Ngữ pháp** có đủ **11 dạng bài** (bao gồm **Ghép cụm từ & Chia thì thành câu**).
5. Tạo thử 1 buổi học hoặc thêm 1 từ mới rồi **F5 tải lại trang** → phiên đăng nhập và dữ liệu vẫn còn nguyên.

> **Mẹo bảo mật thêm:** Bạn cũng có thể chuyển repository GitHub `davengn/english-vocab-learning` sang **Private** (Settings → Danger Zone → Change repository visibility) để hạn chế người lạ xem mã nguồn.
