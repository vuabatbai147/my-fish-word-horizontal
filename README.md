# My Fish World — Language JSON (VI / EN)

Đây là bản Landscape mới nhất, có Firebase và DEV quyền theo UID, đã tách từ điển ra khỏi index.html.

## Thư mục
- `index.html` — Game và chức năng đổi ngôn ngữ.
- `locales/vi.json` — Các khóa chuỗi gốc tiếng Việt.
- `locales/en.json` — Bản dịch tiếng Anh của các khóa tương ứng.
- `auth-cloud.js`, `firebase-config.js`, `firestore.rules` — Firebase không đổi.

## Sử dụng
1. Mở **toàn bộ thư mục** bằng VS Code Live Server (không mở file:// trực tiếp), hoặc deploy lên Vercel.
2. Bảo đảm thư mục `locales` được commit/push cùng `index.html`.
3. Mở Settings → Language → English / Tiếng Việt. Các JSON được tải bằng fetch khi mở game.
4. Muốn sửa cụm tiếng Anh, tìm khóa tiếng Việt trong `locales/en.json` và thay bản dịch.
5. Khi thêm text mới, thêm cùng một khóa vào cả `vi.json` và `en.json`.

Lưu ý: cách dịch đang sử dụng lookup từ **câu gốc tiếng Việt**, nên không đổi keys trừ khi bạn đồng thời sửa chuỗi game tương ứng. Bản này chuyển toàn bộ từ điển cũ ra JSON, không tự động dịch những nội dung chưa có trong từ điển.


## Sửa menu che nút mua (landscape)
- Chừa 112px phía phải cho thanh điều hướng trong các màn danh sách (shop, market, decor, collection, tank).
- Giữ phần danh sách và nút mua trong vùng cuộn không bị menu phủ; không thu hẹp bể cá thêm lần nữa.


## Màn chính mới
- Phong cảnh Canvas nhiều lớp, nước chuyển động và cầu gỗ, nhân vật câu cá.
- Giữ nguyên ID các nút và toàn bộ chức năng hiện có.
