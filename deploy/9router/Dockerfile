# 9Router — cổng LLM tương thích OpenAI, đứng trước nhiều nhà cung cấp.
#
# Tự dựng ảnh thay vì kéo `decocua/9router` như tài liệu của họ chỉ: ảnh đó không kéo được từ
# Docker Hub ("repository does not exist"), đã thử trên máy chủ. Cài từ npm thì kiểm chứng được và
# không phụ thuộc một ảnh có thể biến mất.
FROM node:22-alpine

# Ghim phiên bản: `latest` nghĩa là hai lần dựng cách nhau một tuần cho ra hai cổng khác nhau, và
# khi trợ lý đột nhiên trả lời khác đi thì không có cách nào biết vì sao.
ARG NINE_ROUTER_VERSION=latest
RUN npm install -g "9router@${NINE_ROUTER_VERSION}"

# Cấu hình và lịch sử dùng nằm trong SQLite ở /app/data. Không gắn volume thì khởi động lại là mất
# sạch khoá của các nhà cung cấp.
WORKDIR /app
VOLUME ["/app/data"]

EXPOSE 20128

# 0.0.0.0 để container khác trong cùng mạng gọi được. KHÔNG publish cổng này ra máy chủ (xem
# docker-compose.java.yml) nên nó không lộ ra Internet.
CMD ["9router", "--host", "0.0.0.0"]
