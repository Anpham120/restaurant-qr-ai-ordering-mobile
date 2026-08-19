# CMC Restaurant — chỉ mục tài liệu

**57 tài liệu**, nhóm theo mục đích. Trang này **được SINH RA** bởi
`docs/build_docs_index.py` từ chính các tệp có thật — nên nó không thể trỏ vào tệp không
tồn tại, và không thể bỏ sót tệp mới.

> Vì sao sinh chứ không viết tay: bản chỉ mục viết tay của `docs/archive/` từng khai đã
> chuyển 7 tệp vào đó trong khi thư mục rỗng, còn trang này thì chỉ trỏ tới 11/37 tài liệu.
> Văn xuôi kể lại trạng thái thư mục thì luôn trôi khỏi thư mục.

Thêm tài liệu mới: đặt đúng thư mục rồi chạy `python docs/build_docs_index.py`.

## Bắt đầu ở đây

| Tài liệu | Nội dung |
|---|---|
| [README.md](../README.md) | README |
| [SPEC.md](../SPEC.md) | CMC Restaurant QR Ordering |
| [CONTEXT.md](../CONTEXT.md) | Restaurant Table Ordering |
| [CHANGELOG.md](../CHANGELOG.md) | Changelog |
| [README.md](assets/report/README.md) | Ảnh dùng trong báo cáo học phần |

## Hệ thống AI — cách xây

| Tài liệu | Nội dung |
|---|---|
| [00-problem-statement.md](../ai/docs/00-problem-statement.md) | Bước 0 — Phát biểu bài toán |
| [01-data-dictionary.md](../ai/docs/01-data-dictionary.md) | Bước 1 — Từ điển dữ liệu thực đơn |
| [02-evaluation-set.md](../ai/docs/02-evaluation-set.md) | Bước 2 — Tập đánh giá |
| [03-answer-metric.md](../ai/docs/03-answer-metric.md) | Bước 3 — Thước đo chất lượng câu trả lời |
| [04-answers-without-a-model.md](../ai/docs/04-answers-without-a-model.md) | Bước 4 — Trả lời không cần mô hình |
| [05-knowledge-base.md](../ai/docs/05-knowledge-base.md) | Bước 5 — Kho tri thức nhà hàng |
| [06-generative-model.md](../ai/docs/06-generative-model.md) | Bước 6 — Mô hình sinh, và chỗ duy nhất nó chứng minh được giá trị |
| [07-error-analysis.md](../ai/docs/07-error-analysis.md) | Bước 7 — Truy hồi, phân tích nguyên nhân sai, và bốn phép đo phải làm lại |
| [PHAN-CONG-5-THANH-VIEN.md](../ai/docs/PHAN-CONG-5-THANH-VIEN.md) | Phân công 5 thành viên |

## Hệ thống AI — vận hành và quyết định

| Tài liệu | Nội dung |
|---|---|
| [AI_DECISION_HISTORY.md](ai/AI_DECISION_HISTORY.md) | Lịch sử quyết định của hệ thống AI |
| [AI_NO_TOUCH_BOUNDARY.md](ai/AI_NO_TOUCH_BOUNDARY.md) | AI no-touch boundary |
| [AI_OPERATIONS.md](ai/AI_OPERATIONS.md) | Vận hành lớp AI — triển khai, cấu hình, và runbook |
| [BAO_CAO_DO_AN_HOC_MAY_KPDL.md](ai/BAO_CAO_DO_AN_HOC_MAY_KPDL.md) | TRƯỜNG ĐẠI HỌC CMC |
| [BAO_CAO_HOC_MAY_KPDL.md](ai/BAO_CAO_HOC_MAY_KPDL.md) | TRƯỜNG ĐẠI HỌC CMC |
| [GIAI_THICH_CHI_TIET.md](ai/GIAI_THICH_CHI_TIET.md) | Giải thích chuyên sâu hệ thống |
| [NHOM_TRUONG_ON_TAP.md](ai/NHOM_TRUONG_ON_TAP.md) | Ôn tập cho nhóm trưởng — Phạm Duy An (BIT240002) |

## Kiến trúc và hợp đồng

| Tài liệu | Nội dung |
|---|---|
| [API_CONTRACT.md](backend/API_CONTRACT.md) | Hop Dong API - CMC Restaurant |
| [ARCHITECTURE.md](backend/ARCHITECTURE.md) | Kiến trúc backend |
| [DATABASE.md](backend/DATABASE.md) | Database Setup Guide |
| [BAO_CAO_CONG_NGHE_LAP_TRINH_WEB.md](bao-cao/BAO_CAO_CONG_NGHE_LAP_TRINH_WEB.md) | BÁO CÁO MÔN HỌC |
| [BAO_CAO_CONG_NGHE_PHAN_MEM.md](bao-cao/BAO_CAO_CONG_NGHE_PHAN_MEM.md) | BÁO CÁO BÀI TẬP LỚN |
| [BAO_CAO_DO_AN_CHUYEN_NGANH.md](bao-cao/BAO_CAO_DO_AN_CHUYEN_NGANH.md) | BÁO CÁO ĐỒ ÁN CHUYÊN NGÀNH |
| [BAO_CAO_HOC_MAY_KPDL.md](bao-cao/BAO_CAO_HOC_MAY_KPDL.md) | BÁO CÁO ĐỒ ÁN MÔN HỌC |
| [CHUAN_BI_VAN_DAP.md](bao-cao/CHUAN_BI_VAN_DAP.md) | CHUẨN BỊ VẤN ĐÁP — CMC RESTAURANT |
| [HOI_DAP_KY_THUAT.md](bao-cao/HOI_DAP_KY_THUAT.md) | HỎI ĐÁP KỸ THUẬT — CMC RESTAURANT |
| [HUMAN_PEER_REVIEW.md](bao-cao/HUMAN_PEER_REVIEW.md) | Quy trình và bằng chứng human peer review |
| [KICH_BAN_DO_AN.md](bao-cao/KICH_BAN_DO_AN.md) | Kịch bản thuyết trình — Đồ án chuyên ngành |
| [KICH_BAN_THUYET_TRINH.md](bao-cao/KICH_BAN_THUYET_TRINH.md) | Kịch bản thuyết trình — CMC Restaurant |
| [KICH_BAN_WEB.md](bao-cao/KICH_BAN_WEB.md) | Kịch bản thuyết trình — Công nghệ lập trình Web |
| [PHAN_CONG_CONG_VIEC.md](bao-cao/PHAN_CONG_CONG_VIEC.md) | Phân công công việc — giai đoạn hoàn thiện và bảo vệ |
| [PHAN_UNG_VAN_DAP.md](bao-cao/PHAN_UNG_VAN_DAP.md) | BỘ CÂU HỎI PHẢN ỨNG — NHÓM TRƯỞNG (AI & DEVOPS) |
| [PIPELINE_AND_DEPLOY.md](devops/PIPELINE_AND_DEPLOY.md) | CI/CD, triển khai và vận hành production |
| [OPS_APP.md](frontend/OPS_APP.md) | Ứng dụng vận hành — workspace và quầy |
| [BAO_CAO_SO_KHOP_NET_JAVA.md](pm/BAO_CAO_SO_KHOP_NET_JAVA.md) | Báo cáo so khớp hành vi song song: .NET vs Java |
| [KE_HOACH_HOC_KY_2026-2.md](pm/KE_HOACH_HOC_KY_2026-2.md) | Kế hoạch học kỳ 2026-2 — Fork cá nhân CMC Restaurant |

## Quy trình nhóm

| Tài liệu | Nội dung |
|---|---|
| [GIT_AND_TEAM.md](devops/GIT_AND_TEAM.md) | Quy trình Git và làm việc nhóm |

## Lưu trữ — KHÔNG dùng để triển khai

| Tài liệu | Nội dung |
|---|---|
| [ADMIN_UI_REDESIGN_BLUEPRINT.md](archive/ADMIN_UI_REDESIGN_BLUEPRINT.md) | Blueprint Thiết Kế Lại Giao Diện Quản Lý Nhà Hàng |
| [AI_ARCHITECTURE.md](archive/AI_ARCHITECTURE.md) | Kiến trúc hệ thống AI |
| [AI_EVALUATION.md](archive/AI_EVALUATION.md) | Đánh giá hệ thống AI — kế hoạch, giao thức, runbook |
| [AI_KNOWLEDGE_BASE_GUIDE.md](archive/AI_KNOWLEDGE_BASE_GUIDE.md) | Hướng Dẫn Xây Knowledge Base Cho RAG |
| [AI_KNOWLEDGE_BASE_SCHEMA.md](archive/AI_KNOWLEDGE_BASE_SCHEMA.md) | Knowledge base chunk schema (audit reference) |
| [AI_SYSTEM_IMPLEMENTATION_SUMMARY.md](archive/AI_SYSTEM_IMPLEMENTATION_SUMMARY.md) | BÁO CÁO TỔNG HỢP CÁC CÔNG VIỆC ĐÃ THỰC HIỆN VỚI HỆ THỐNG AI |
| [ORDERING_SESSION_INVOICE_REFACTOR_PLAN.md](archive/ORDERING_SESSION_INVOICE_REFACTOR_PLAN.md) | Refactor plan: table-session ordering and settlement |
| [PROJECT_CONTEXT.md](archive/PROJECT_CONTEXT.md) | Ngữ Cảnh Dự Án |
| [README.md](archive/README.md) | Tài liệu lưu trữ |
| [REFACTOR_PLAN.md](archive/REFACTOR_PLAN.md) | Kế Hoạch Refactor — CMC Restaurant QR AI Ordering |
| [REMEDIATION_PLAN.md](archive/REMEDIATION_PLAN.md) | Kế Hoạch Khắc Phục Toàn Bộ — CMC Restaurant QR AI Ordering |
| [RESTAURANT_UI_FEATURE_BENCHMARK.md](archive/RESTAURANT_UI_FEATURE_BENCHMARK.md) | Benchmark Giao Dien Va Tinh Nang Nha Hang |
| [SMART_TABLE_QR_PLAN.md](archive/SMART_TABLE_QR_PLAN.md) | Kế hoạch nâng cấp QR bàn thông minh |
| [SYSTEM_ANALYSIS_DESIGN.md](archive/SYSTEM_ANALYSIS_DESIGN.md) | Phân Tích & Thiết Kế Hệ Thống — CMC Restaurant QR AI Ordering |
| [TABLE_ORDERING_APP_REFACTOR_PLAN.md](archive/TABLE_ORDERING_APP_REFACTOR_PLAN.md) | Kế hoạch refactor ứng dụng gọi món tại bàn độc lập |
| [TESTING.md](archive/TESTING.md) | Kiểm thử — kế hoạch, checklist, bằng chứng |
