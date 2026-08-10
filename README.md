# irohana-locale (`irl`)

Công cụ TUI tương tác gom các script địa phương hoá (localization) của dự án
**irohana-study** vào một chỗ. Thay vì kéo-thả file vào terminal rồi gõ lệnh
thủ công nhiều lần, bạn chỉ cần chạy `irl`, chọn công cụ từ menu, kéo-thả
file/thư mục và xem log chạy trực tiếp.

- **Giao diện tiếng Việt.**
- **Không phụ thuộc vị trí repo:** mỗi công cụ hỏi đường dẫn thư mục dự án
  (repo chứa `src/i18n/locales`) và **ghi nhớ** đường dẫn của lần chạy gần nhất
  để lần sau chỉ cần nhấn Enter.
- **Kết quả** được ghi vào `<thư-mục-dự-án>/irl-output/<tên-công-cụ>/`.

---

## Yêu cầu (Prerequisites)

- **Node.js >= 18** (khuyến nghị dùng bản LTS hoặc mới hơn — đã test trên Node 24).
- **Git** để clone repo này.
- Quyền truy cập vào repo dự án cần xử lý (repo có thư mục `src/i18n/locales`).
- Terminal tương tác (TTY) — chạy trực tiếp trong terminal, không qua pipe.

> Công cụ chỉ **đọc/ghi** file locale bên trong thư mục dự án bạn chỉ định.
> Nó không cần được đặt bên trong repo dự án.

---

## Cài đặt (Installation)

Repo này ở dạng nội bộ. Cài bằng cách clone rồi cài global:

```bash
# 1. Clone
git clone git@github.com:thailpm-hopee/irohana-locale.git
cd irohana-locale

# 2. Cài dependencies
npm install

# 3. Cài global để dùng lệnh `irl` ở bất cứ đâu
npm install -g .
```

Sau khi cài, kiểm tra:

```bash
irl
```

Gỡ cài đặt:

```bash
npm uninstall -g irohana-locale
```

---

## Sử dụng (Usage)

```bash
irl
```

Luồng thao tác:

1. **Chọn công cụ** trong menu — dùng `↑`/`↓` để di chuyển, `Enter` để chọn.
   Mục đầu tiên là **`⚙ Cài đặt`** (xem [Cài đặt](#cài-đặt-settings)).
2. **Nhập dữ liệu đầu vào** theo từng bước:
   - **Thư mục / File:** *kéo-thả* thư mục hoặc file từ Finder vào terminal (đường
     dẫn đầy đủ sẽ tự điền, kể cả khi có dấu cách), rồi nhấn `Enter`. Đường dẫn
     dán vào được tự chuẩn hoá (bỏ dấu nháy, bỏ ký tự escape `\ `, mở rộng `~`).
   - **Lựa chọn:** dùng `↑`/`↓` rồi `Enter`.
   - **Văn bản:** gõ trực tiếp; để trống để dùng giá trị mặc định.
   - Nếu đã chạy trước đó, giá trị cũ hiện sẵn — chỉ cần `Enter` để dùng lại.
3. **Xem log trực tiếp** khi công cụ đang chạy (có spinner ⠋).
4. **Kết thúc:** hiện dấu `✔` (thành công) hoặc `✖` (lỗi) kèm đường dẫn kết quả.
   Nhấn `Enter` để về menu, `Ctrl+C` để thoát.

**Phím tắt:**
- Danh sách: `↑`/`↓` di chuyển · `Enter` xác nhận · `Ctrl+C` thoát.
- Ô nhập đường dẫn (soạn thảo như terminal chuẩn, có con trỏ di chuyển được):
  - `←`/`→` hoặc `Ctrl+B`/`Ctrl+F` — di chuyển con trỏ
  - `Ctrl+A` / `Ctrl+E` — về đầu / cuối dòng
  - `Backspace` — xoá ký tự trước con trỏ; `Ctrl+D` — xoá ký tự tại con trỏ
  - `Ctrl+W` — xoá 1 từ về khoảng trắng gần nhất (xoá cả đường dẫn nếu không có dấu cách)
  - `Option (Alt)+Delete` — xoá **1 đoạn** trước con trỏ, phân tách bởi `/` `.` `-` `_`… Ví dụ: `a/b/c` → `a/b/` → `a/b` → `a/` → `a`. `Alt+D` — xoá 1 đoạn sau con trỏ
  - `Ctrl+U` — xoá cả dòng; `Ctrl+K` — xoá từ con trỏ đến cuối dòng
  - `Ctrl+Z` — **hoàn tác** thao tác vừa rồi (khôi phục ký tự vừa xoá/gõ)
  - `↑` (mũi tên lên) — **điền lại** giá trị mặc định/đã lưu vào ô để chỉnh sửa
    (ví dụ khi đã xoá ô nhưng muốn lấy lại đường dẫn của lần trước rồi sửa)

> Lưu ý: trên macOS, `Cmd+Z`/`Cmd+Delete` thường không được terminal gửi tới ứng
> dụng — hãy dùng `Ctrl+Z` để hoàn tác và `Ctrl+U` để xoá cả dòng.

### Cài đặt (Settings)

Chọn **`⚙ Cài đặt`** ở đầu menu (`↑`/`↓` di chuyển · `Enter`/`Space` bật-tắt ·
`Esc` quay lại). Hiện có:

- **Ghi file kết quả/báo cáo cho "Cập nhật i18n từ Excel"** — mặc định **tắt**.
  Khi tắt, công cụ *chỉ cập nhật các dòng trong file locale*, **không** tạo thư
  mục `irl-output` trong dự án (các file trung gian được ghi vào thư mục tạm và
  xoá sau khi chạy). Bật nếu bạn muốn giữ lại report/diff/merged-excel.
- **Công cụ hiển thị trong menu** — bật/tắt từng công cụ (mặc định bật tất cả;
  luôn giữ ít nhất 1 công cụ được bật).

Cài đặt lưu tại `~/.config/irohana-locale/settings.json`.

---

## Các công cụ (Tools)

Mỗi công cụ đều hỏi **Thư mục dự án** (repo chứa `src/i18n/locales`) và ghi kết
quả vào `<thư-mục-dự-án>/irl-output/<tên-công-cụ>/`.

### 1. Cập nhật i18n từ Excel — `i18n-update`

Đọc file Excel dịch thuật, so sánh & áp dụng thay đổi vào các file locale
(`common.json`), rồi format lại bằng Prettier.

| Đầu vào | Kiểu | Ghi chú |
|--------|------|---------|
| Thư mục dự án | thư mục | Kéo-thả repo (chứa `src/i18n/locales`) |
| File Excel | file `.xlsx` | Kéo-thả file dịch thuật |
| Bố cục Excel | lựa chọn | `paired` (2 cột/ngôn ngữ, mặc định), `single` (1 cột/ngôn ngữ), hoặc `multi` (nhiều cột/ngôn ngữ) |

**Bố cục (layout):**

- **`paired`** — mỗi ngôn ngữ có 2 cột cố định *current* + *updated*. Chỉ áp
  dụng thay đổi khi *updated* khác *current* (so sánh giữa 2 cột Excel). Yêu cầu
  vị trí cột cố định và **giống nhau** cho mọi ngôn ngữ.
- **`single`** — mỗi ngôn ngữ có đúng 1 cột; giá trị trong cột được so trực tiếp
  với file JSON locale. Cột được nhận diện qua header dạng `"<lang> (ngày)"`.
- **`multi`** — mỗi ngôn ngữ có thể có **nhiều cột** (ví dụ 1 cột gốc + nhiều đợt
  chỉnh sửa) và **số cột giữa các ngôn ngữ có thể khác nhau**. Cột được nhận diện
  qua header (`"<lang> (…)"`); giá trị áp dụng là **ô được duyệt ở cột phải nhất**
  (bỏ qua ô trống, `未チェック`, ô gạch ngang), so **trực tiếp với JSON locale**.
  Vì lấy JSON làm chuẩn nên chạy nhiều lần liên tiếp (chưa commit) vẫn đúng —
  không cần vòng xuất "merged Excel" như `paired`.

  **Chọn ngôn ngữ (chỉ ở `multi`):** sau khi chọn `multi`, TUI hiện thêm một
  bước cho phép **chọn ngôn ngữ nào sẽ ghi vào `common.json`** dựa trên các ngôn
  ngữ tìm thấy trong file Excel. Mặc định **chọn tất cả**; dùng `Space` để bỏ
  chọn ngôn ngữ không muốn cập nhật (lựa chọn được **ghi nhớ** cho lần sau).
  Không bắt buộc phải đủ mọi ngôn ngữ — công cụ sẽ in danh sách ngôn ngữ **không
  được cập nhật** so với JSON (theo mã 2 ký tự): ngôn ngữ bị bỏ chọn, và ngôn ngữ
  có trong JSON nhưng thiếu cột trong Excel. Chạy trực tiếp thì dùng cờ
  `--languages=vi,en,ja` (bỏ cờ = cập nhật mọi ngôn ngữ phát hiện được).

**Kết quả:** mặc định công cụ **chỉ cập nhật các file `common.json`** (tại chỗ) —
không tạo thư mục `irl-output`. Nếu bật *Ghi file kết quả* trong
[Cài đặt](#cài-đặt-settings), các file phụ được ghi vào `irl-output/i18n-update/`:
`diff-full.json`, `diff-updates.json`, `update-report.md`,
`i18n-transformed-check.md/.xlsx`, `notices.md`, và (bố cục `paired`)
`localize_merged_YYYY-MM-DD.xlsx`.

Chạy trực tiếp không cần TUI:

```bash
node tools/i18n-update/run.js "/đường-dẫn/file.xlsx" \
  --project-root="/đường-dẫn/repo" [--layout=paired|single|multi] [--languages=vi,en,ja]
```

### 2. Xuất gói localization (ZIP) — `export-localization`

Gộp toàn bộ dữ liệu dịch (XLSX tổng hợp + JSON từng ngôn ngữ) thành
`localization.zip` để bàn giao cho team dịch.

| Đầu vào | Kiểu | Ghi chú |
|--------|------|---------|
| Thư mục dự án | thư mục | Kéo-thả repo (chứa `src/i18n/locales`) |

**Kết quả** (`irl-output/export-localization/`): `localization.zip`,
`i18n_export.xlsx`, và `json/{lang}.json`.

Chạy trực tiếp:

```bash
node tools/export-localization/run.js --project-root="/đường-dẫn/repo"
```

### 3. Tìm key locale không dùng — `find-unused-locale-keys`

Quét thư mục `src/` để tìm các key trong file locale không còn được tham chiếu.

| Đầu vào | Kiểu | Ghi chú |
|--------|------|---------|
| Thư mục dự án | thư mục | Kéo-thả repo (chứa `src/i18n/locales`) |
| Ngôn ngữ chuẩn | văn bản | Mặc định `en`. Ví dụ: `ja`, `vi` |

**Kết quả** (`irl-output/find-unused-locale-keys/`): `unused-keys-report.md`,
`unused-keys.json`.

Chạy trực tiếp:

```bash
node tools/find-unused-locale-keys/find-unused-keys.js [lang] \
  --project-root="/đường-dẫn/repo"
```

---

## Vị trí dữ liệu

- **Kết quả:** `<thư-mục-dự-án>/irl-output/<tên-công-cụ>/`
- **Cache đường dẫn gần nhất:** `~/.config/irohana-locale/cache.json`
  (hoặc `$XDG_CONFIG_HOME/irohana-locale/cache.json`).
- **Cài đặt:** `~/.config/irohana-locale/settings.json`.

---

## Phát triển — thêm công cụ mới

Mỗi công cụ là một thư mục con trong `tools/`. TUI tự phát hiện công cụ qua file
`irl.config.js`.

1. Tạo `tools/<id>/irl.config.js` (CommonJS) khai báo `title`, `description`,
   `entry`, và danh sách `inputs`. Mỗi input mô tả `type`
   (`folder` | `file` | `select` | `text`), cách truyền `pass`
   (`env` | `arg` | `flag`), và tuỳ chọn `cache`.
2. Viết script `entry` (CommonJS). Lấy đường dẫn dự án qua
   `require('../_shared/project')` — các hàm `resolveProjectRoot()`,
   `resolveLocalesDir()`, `resolveSrcDir()`, `resolveOutputDir(id)` — thay vì
   suy ra từ `__dirname`. Nhờ vậy script chạy được khi đã cài global.
3. Chạy `irl` — công cụ mới xuất hiện trong menu.

## Cấu trúc thư mục

```
irohana-locale/
├── bin/irl.mjs                 # Điểm vào, khởi động TUI
├── src/                        # Mã nguồn TUI (Ink + React + htm)
│   ├── app.mjs                 # Các màn hình & điều phối
│   ├── discover.mjs            # Quét tools/*/irl.config.js
│   ├── runner.mjs              # Spawn script & stream log
│   ├── cache.mjs               # Ghi nhớ đường dẫn gần nhất
│   └── paths.mjs               # Chuẩn hoá đường dẫn kéo-thả
└── tools/                      # Các công cụ (nguồn chính thức)
    ├── _shared/project.js      # Bộ giải đường dẫn dự án dùng chung
    ├── i18n-update/
    ├── export-localization/
    └── find-unused-locale-keys/
```
