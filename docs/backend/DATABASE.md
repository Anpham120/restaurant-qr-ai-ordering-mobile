# Database Setup Guide

> **⚠️ Kiểm lần cuối: 2026-06-14. Mã sửa gần nhất: 2026-08-02.**
>
> Tài liệu này KHÔNG trỏ vào tệp hay endpoint nào đã biến mất — đã kiểm bằng máy. Nhưng phép
> kiểm đó chỉ bắt được *đường dẫn chết*, **không** bắt được *hành vi đã đổi*: một endpoint còn
> nguyên tên mà đổi dạng phản hồi thì vẫn 'sạch'. Đối chiếu với mã trước khi tin phần chi tiết.

## Overview

Hệ thống sử dụng **PostgreSQL 16** làm cơ sở dữ liệu chính. Truy cập dữ liệu qua **Spring Data
JPA / Hibernate**; lược đồ do **Flyway** quản lý bằng các tệp SQL đánh số trong
`backend-java/src/main/resources/db/migration/`.

## Prerequisites

- JDK 21 (hoặc dùng `./gradlew` với toolchain tự tải)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (để chạy PostgreSQL qua Docker Compose)
- Hoặc PostgreSQL 16+ cài trực tiếp trên máy

## Quick Start (Docker Compose)

### 1. Copy environment file

```bash
cd backend
cp .env.example .env
```

### 2. Start PostgreSQL

```bash
docker-compose up -d postgres
```

Kiểm tra PostgreSQL đã sẵn sàng:

```bash
docker-compose ps
# postgres | PostgreSQL is online
```

### 3. Chạy migrations

Flyway chạy TỰ ĐỘNG lúc ứng dụng khởi động. Chạy riêng bằng profile `migrate` của Compose:

```bash
docker compose -f deploy/docker-compose.java.yml --profile migrate run --rm migrate
```

Tạo migration mới: thêm một tệp vào `backend-java/src/main/resources/db/migration/` theo đúng quy
ước tên `V<số>__<mo_ta>.sql`. Số phải LỚN HƠN mọi tệp đang có — hiện cao nhất là `V12`.

Flyway ghi lại tổng kiểm của từng tệp ĐÃ CHẠY, nên sửa một migration đã áp dụng sẽ làm lần khởi
động sau HỎNG, thay vì âm thầm bỏ qua. Đó là hành vi đúng: một lược đồ đã chạy trên dữ liệu thật
không sửa lại được bằng cách viết đè.

### 4. Seed data

Dữ liệu mẫu do Flyway chạy cùng các migration. Giá trị mẫu phải ổn định — một giá trị đổi theo
thời điểm chạy sẽ làm lần sinh migration sau khác lần trước mà không ai đổi gì. Gồm:

- **6 categories**: Khai vi, Mon chinh, Pho va bun, Hai san, Do uong, Trang mieng
- **12 menu items**: Com ga, Com suon nuong, Pho bo, Bun bo Hue, Goi cuon, Cha gio, Tom rang muoi, Lau Thai, Tra dao, Ca phe sua da, Che khuc bach, Banh flan
- **8 tables**: T01 - T08
- **4 demo users**: Admin, Staff, Kitchen, Customer seed account.

Quy ước seed auth:

- Không lưu mật khẩu plaintext trong database hoặc migration.
- `password_hash` của demo users là chuỗi PBKDF2 đã generate sẵn theo định dạng `v1.<iterations>.<salt>.<hash>`.
- Không gọi password hasher ngẫu nhiên trong `HasData`; nếu cần đổi demo password phải generate hash mới một lần và commit hash cố định.
- Timestamp của seed data dùng hằng số cố định, không dùng `DateTimeOffset.UtcNow` trong `HasData`.

### 5. Khởi động app

```bash
docker compose -f deploy/docker-compose.java.yml up -d api
```

## Connection Strings

### Development (Local)

Đã được cấu hình trong `appsettings.Development.json`:

```
Host=localhost;Port=5432;Database=restaurant_qr_test;Username=restaurant_user;Password=ChangeMe123!
```

### Staging

Trong `appsettings.Staging.json`:

```
Host=staging-postgres;Port=5432;Database=restaurant_qr_staging;Username=restaurant_user;Password=${STAGING_DB_PASSWORD}
```

### Production

Trong `appsettings.Production.json`, sử dụng biến môi trường:

```bash
export DB_HOST=prod-postgres.example.com
export DB_PORT=5432
export DB_NAME=restaurant_qr_prod
export DB_USERNAME=restaurant_user
export DB_PASSWORD=<your-password>
```

```
Host=${DB_HOST};Port=${DB_PORT:-5432};Database=${DB_NAME};Username=${DB_USERNAME};Password=${DB_PASSWORD};Pooling=true;Minimum Pool Size=5;Maximum Pool Size=100;SSL Mode=Require
```

## Database Schema

### Tables

| Table | Mô tả |
|-------|-------|
| `categories` | Danh mục món ăn |
| `menu_items` | Món ăn trong menu |
| `restaurant_tables` | Bàn trong nhà hàng |
| `orders` | Đơn hàng |
| `order_items` | Chi tiết món trong đơn hàng |
| `payments` | Thông tin thanh toán |
| `table_sessions` | Phiên khách ngồi tại một bàn |
| `table_invoices` | Hoá đơn chốt theo bàn |
| `cart_items` | Giỏ dùng chung của một phiên bàn |
| `loyalty_members` · `loyalty_rewards` | Hội viên và ưu đãi đổi điểm |
| `promotions` | Khuyến mãi áp theo đơn |
| `counter_shifts` · `counter_shift_transactions` | Ca quầy và thu chi trong ca |

Ba bảng `chat_sessions`, `chat_messages` và `knowledge_entries` có trong lược đồ nền (V1) nhưng
đã bị **V28 xoá**. Đừng khôi phục chúng: không mã nào còn đọc.

### Key Conventions

- Tất cả tables sử dụng `snake_case` naming
- Tất cả columns sử dụng `snake_case` naming
- Enums được lưu dưới dạng `string` trong database
- Kiểu mảng (`tags`) dùng kiểu gốc của PostgreSQL (`text[]`)

### Indexes

- `IX_menu_items_category_id` - cho JOIN theo category
- `IX_orders_order_code` (unique) - cho lookup theo mã đơn
- `IX_orders_status` - cho filter theo trạng thái
- `IX_restaurant_tables_table_code` (unique) - cho lookup bàn
- Và nhiều indexes khác

## Health Checks

Hệ thống cung cấp hai endpoint health check:

### Liveness Probe

```
GET /health/live
```

Kiểm tra app đang chạy. Không kiểm tra database.

### Readiness Probe

```
GET /health/ready
```

Kiểm tra app có thể xử lý request, bao gồm kết nối PostgreSQL.

## Environment Variables

| Variable | Mô tả | Default |
|----------|--------|---------|
| `POSTGRES_PASSWORD` | Password PostgreSQL | `ChangeMe123!` |
| `POSTGRES_DB` | Database name | `restaurant_qr` |
| `POSTGRES_USER` | Database user | `restaurant_user` |
| `SPRING_DATASOURCE_URL` | JDBC URL cho backend Java | (xem Development) |

## Troubleshooting

### PostgreSQL không khởi động được

```bash
docker-compose logs postgres
```

Kiểm tra port 5432 đã được sử dụng chưa:

```bash
netstat -an | grep 5432
```

### Migration failed

Đảm bảo PostgreSQL đang chạy:

```bash
docker-compose up -d postgres
# Đợi health check pass
docker-compose ps
```

### Connection refused

Kiểm tra connection string trong `appsettings.Development.json`:

```
Host=localhost;Port=5432
```

## Docker Compose Services

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: restaurant_qr
      POSTGRES_USER: restaurant_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U restaurant_user -d restaurant_qr"]
```

Volume `postgres_data` được mount để persist data giữa các lần restart.

## Next Steps

- [ ] Cập nhật Docker Compose để include app service
- [ ] Thiết lập CI/CD cho database migrations
- [ ] Cấu hình backup strategy cho PostgreSQL
- [ ] Theo dõi query performance với `pg_stat_statements`
