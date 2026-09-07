<div align="center">
  <img src="../../frontend/public/shop-assets/icon.png" alt="Logo quán Mây" width="150" />

# BÁO CÁO BÀI TẬP LỚN
## Học phần: {{TÊN HỌC PHẦN}} — {{MÃ HP}} ({{SỐ}} tín chỉ)

**Trường Đại học CMC — Khoa Công nghệ thông tin & Truyền thông**

**Đề tài:** {{TÊN ĐỀ TÀI}}

**Repository:** [Kho mã nguồn GitHub]({{URL KHO MÃ}})

**Sản phẩm trực tuyến:** {{DANH SÁCH TÊN MIỀN}}

**Giảng viên phụ trách:** {{HỌ TÊN}}

**Thời gian thực hiện:** {{TỪ}} – {{ĐẾN}} · Số liệu chốt tại tag `{{TAG}}`, {{NGÀY}}

</div>

**Nhóm thực hiện ({{N}} sinh viên):**

*Bảng 1 — Danh sách thành viên nhóm*

| Họ và tên | MSSV | Vai trò chính |
|---|---|---|
| {{HỌ TÊN}} | {{MSSV}} | {{VAI TRÒ}} |

---

## Tóm tắt dự án

{{Một đoạn: bài toán, cách giải, và kết quả đo được. Không hứa, không tính từ —
mỗi câu phải có một con số hoặc một sự việc kiểm chứng được đứng sau.}}

## Mục lục

{{Sinh tự động khi xuất .docx — không viết tay.}}

## Danh mục bảng

{{Lấy từ chính nhãn `*Bảng N — …*` trong thân báo cáo.}}

## Danh mục hình

{{Lấy từ chính nhãn `*Hình N — …*` trong thân báo cáo.}}

## Danh mục từ viết tắt

| Viết tắt | Nghĩa đầy đủ |
|---|---|
| {{VT}} | {{NGHĨA}} |

## Bảng phân công công việc

*Bảng 2 — Phân công theo hạng mục*

| Thành viên | Hạng mục | Bằng chứng (PR / commit / issue) |
|---|---|---|
| {{TÊN}} | {{HẠNG MỤC}} | {{#PR hoặc mã commit}} |

---

# Đặt vấn đề

{{Bối cảnh quan sát được, không phải bối cảnh giả định. Nếu có khảo sát thực tế
thì nêu số mẫu và nơi khảo sát.}}

# 1. Giới thiệu chung

## 1.1. Lý do chọn đề tài
## 1.2. Tầm nhìn sản phẩm (Product Vision)
## 1.3. Mục tiêu và phạm vi
## 1.4. Ý nghĩa và ứng dụng thực tế
## 1.5. Tổ chức báo cáo

# 2. Phân tích & thiết kế sản phẩm

## 2.1. Phân tích nhu cầu người dùng
## 2.2. Yêu cầu chức năng và phi chức năng
## 2.3. Kiến trúc sản phẩm
## 2.4. Chất lượng và vận hành

# 3. Quy trình cộng tác và công cụ

## 3.1. Cách nhóm dùng GitHub
## 3.2. Phân công và đóng góp

# 4. Liên hệ lý thuyết

{{Mỗi mục nhỏ ứng với một chương giáo trình của học phần. Nêu rõ chỗ dự án LÀM
KHÁC sách và vì sao — phần này mới có điểm, phần chép lại sách thì không.}}

# 5. Kết quả thực hiện

## 5.1. Sản phẩm / MVP
## 5.2. Đánh giá kết quả đạt được

{{Chỉ đưa số ĐO ĐƯỢC. Số nào chưa đo thì viết thẳng là chưa đo — một con số
không có nguồn làm hỏng độ tin của cả báo cáo.}}

# 6. Hạn chế và hướng phát triển

# Tài liệu tham khảo

{{Định dạng IEEE. Chạy `sua_tham_khao_ieee.py` để chuẩn hoá.}}

---

<!--
CÁCH DÙNG KHUÔN NÀY
===================

1. Chép tệp này thành `docs/bao-cao/BAO_CAO_<TÊN_HỌC_PHẦN>.md`, thay mọi
   `{{...}}`.

2. Sơ đồ: viết thẳng khối ```mermaid hoặc ```plantuml trong thân báo cáo, rồi:

       python docs/bao-cao/render_so_do.py BAO_CAO_<HỌC_PHẦN>.md

   Ảnh được đánh số theo ĐÚNG thứ tự khối xuất hiện trong tệp, vì
   `xuat_bao_cao_docx.py` tiêu thụ so-do-1, so-do-2… tuần tự.

3. Xuất bản nộp:

       python docs/bao-cao/xuat_bao_cao_docx.py BAO_CAO_<HỌC_PHẦN>.md
       python docs/bao-cao/dinh_dang_lai_docx.py     # nếu cần chỉnh lại khổ/độ giãn
       python docs/bao-cao/sua_tham_khao_ieee.py     # chuẩn hoá mục tài liệu tham khảo

NGUYÊN TẮC KHÔNG ĐƯỢC PHÁ
-------------------------
`xuat_bao_cao_docx.py` đọc MỌI THỨ từ Markdown — không có danh sách cứng nào
trong mã. Chú thích bảng/hình lấy từ chính nhãn `*Bảng N — …*` và `*Hình N — …*`.
Nên bản .docx không thể lệch khỏi bản Markdown: sửa Markdown rồi chạy lại là khớp.
Đừng sửa tay vào .docx — lần xuất sau sẽ ghi đè, và bản in sẽ khác bản trong kho.
-->
