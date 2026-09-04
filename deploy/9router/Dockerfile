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

# Cấu hình, mật khẩu và khoá nhà cung cấp nằm trong SQLite ở `/root/.9router`.
#
# KHÔNG phải `/app/data`. Dòng này trước đây khai `/app/data` và compose gắn volume theo, nên
# volume luôn rỗng còn dữ liệu thật nằm trong lớp ghi tạm — mất sạch ở lần dựng lại. Đo trên máy
# chủ đang chạy: `/app/data` 0 byte, `/root/.9router` 30.6MB.
#
# Giữ dòng VOLUME ở ĐÚNG chỗ để ai chạy `docker run` trần cũng không mất dữ liệu, dù compose vẫn
# khai mount tường minh.
WORKDIR /app
VOLUME ["/root/.9router"]

EXPOSE 20128

# 0.0.0.0 để container khác trong cùng mạng gọi được. KHÔNG publish cổng này ra máy chủ (xem
# docker-compose.java.yml) nên nó không lộ ra Internet.
CMD ["9router", "--host", "0.0.0.0"]
