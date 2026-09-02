FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Gói cho tầng HTTP + tầng truy hồi bằng embedding. Phần dữ liệu, thước đo và tập đánh giá dùng thư
# viện chuẩn của Python.
#
# LỊCH SỬ, và một chỗ chính em đã ghi sai
# ---------------------------------------
# Bản cũ có ba dòng ở đây và cả ba đã bị bỏ ở bước 5. Chú thích cũ nói cả ba "sẽ làm BUILD THẤT
# BẠI", trong đó có:
#
#   pip install torch==2.13.0+cpu    "phiên bản đó không tồn tại (torch mới nhất ~2.x thấp hơn
#                                    nhiều)"
#
# Câu trong ngoặc kép ĐÃ SAI, và kiểm được: `pip install --dry-run --extra-index-url
# https://download.pytorch.org/whl/cpu 'torch>=2.2,<3.0'` giải ra đúng `torch-2.13.0+cpu`. Phiên bản
# đó có thật. Cái làm bản cũ thất bại là THIẾU `--extra-index-url` — không có index của PyTorch thì
# PyPI không có hậu tố `+cpu` nào, nên pin đó không giải được.
#
# Giữ đoạn này vì nó là ví dụ đúng chủ đề của dự án: em kết luận "không tồn tại" từ chỗ nó không
# giải được, thay vì từ việc tra index. Một lý lẽ sai vẫn dẫn tới việc bỏ đúng thứ cần bỏ lúc đó,
# nhưng nó để lại một câu sai trong tài liệu — và câu đó sống thêm hai bước nữa.
#
# Hai dòng còn lại thì lý lẽ đúng lúc đó và nay ĐÃ ĐẢO, xem `requirements.txt`.
#
# Không test nào bắt được ba dòng đó, vì test chạy từ mã nguồn chứ không build ảnh. Cùng lớp lỗi
# với `CMD` trỏ vào `app.main:app` — một module không tồn tại. Xem `test_packaging.py`.
COPY ai/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# TẢI SẴN mô hình embedding lúc BUILD, không lúc chạy.
#
# Tải lúc chạy có hai hậu quả, và cả hai đều xấu: khách ĐẦU TIÊN chờ tải ~500MB, và dịch vụ phụ
# thuộc mạng ra Hugging Face SAU KHI đã báo khởi động xong — tức `/ready` nói sẵn sàng trong khi
# lượt chat đầu vẫn treo.
#
# `HF_HOME` trỏ vào chỗ người dùng `app` đọc được. Đặt TRƯỚC khi tạo user để lớp này cache được.
ENV HF_HOME=/opt/hf
# CỐ Ý KHÔNG đặt `SENTENCE_TRANSFORMERS_HOME`.
#
# Đặt nó làm sentence-transformers đọc ở `/opt/hf/models--...`, trong khi `snapshot_download` ghi
# vào `/opt/hf/hub/models--...` — HAI GỐC CACHE KHÁC NHAU. Lúc còn cho tải trực tuyến thì không ai
# thấy: lượt nạp chỉ đơn giản tải lại lần nữa vào gốc của nó. Chỉ khi chặn bằng `HF_HUB_OFFLINE=1`
# nó mới lộ ra — và lộ bằng một lỗi nói về MẠNG, không nói về đường dẫn:
#
#     OSError: We could not connect to https://huggingface.co ... and could not find them in the
#     cached files.
#
# Để trống thì cả hai cùng dùng `HF_HOME/hub`, và cờ ngoại tuyến trở thành phép kiểm thật.
#
# CHỈ tải trọng số mà lúc chạy THẬT SỰ dùng.
#
# Kho `BAAI/bge-m3` mang hai bộ trọng số cho cùng một mô hình:
#
#     pytorch_model.bin        ~2,2GB   ← sentence-transformers nạp cái này
#     onnx/model.onnx_data     ~2,1GB   ← chỉ dùng nếu chạy qua ONNX Runtime
#
# Dịch vụ này chạy qua torch, nên bộ ONNX là dung lượng chết: nằm trong ảnh, không tốn byte RAM
# nào, và không ai đọc tới. Đo trước khi sửa: /opt/hf = 4,3GB.
#
# LỊCH SỬ HAI LẦN SAI, giữ lại vì mỗi lần sai theo một kiểu đáng nhớ:
#
#   lần 1  tải đủ rồi XOÁ .bin, nhưng lượt nạp kiểm chứng phía sau TẢI LẠI đúng tệp vừa xoá.
#          Log in ra "đã bỏ", `du` vẫn 4,3GB. Xoá rồi dọn thua không tải thứ thừa.
#
#   lần 2  chặn tải lại bằng cờ ngoại tuyến, rồi đòi `model.safetensors`. Build hỏng — vì kho NÀY
#          không có safetensors. Giả thuyết "hai định dạng trùng" đúng, nhưng đoán sai LÀ HAI CÁI
#          NÀO. Chỉ `list_repo_files` mới trả lời được, và đó là việc lẽ ra phải làm đầu tiên.
#
# Lượt nạp thứ hai chạy NGOẠI TUYẾN có chủ đích: nếu cache còn thiếu thì build HỎNG tại đây, thay
# vì âm thầm tải bù và biến `HF_HUB_OFFLINE=1` ở tầng sau thành một lời hứa suông.
RUN python -c "import huggingface_hub, pathlib, sys; p = huggingface_hub.snapshot_download('BAAI/bge-m3', ignore_patterns=['onnx/*', '*.h5', '*.msgpack']); w = pathlib.Path(p) / 'pytorch_model.bin'; sys.exit('khong co pytorch_model.bin trong ' + p) if not w.exists() else print('trong so:', w, round(w.stat().st_size / 1e9, 2), 'GB')" \
    && HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')" \
    && du -sh /opt/hf \
    && chmod -R a+rX /opt/hf

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home app \
    && chown -R app:app /app

COPY --chown=app:app ai ./ai

# Dịch vụ AI đọc hai tệp trong `data/` lúc chạy, và chúng PHẢI có trong ảnh:
#
#   menu-dataset.json   service.py — 91 món, là dữ liệu để lọc và nêu giá
#   menu-tags.json      llm_understand.py — từ điển nhãn để kiểm nhãn mô hình trả về
#
# Trước đây dòng này không có, nên thư mục chứa chúng không tồn tại trong ảnh. Và chỗ đọc thoái hóa
# IM LẶNG khi thiếu tệp, nên hậu quả là toàn bộ chủ đề chính sách trả "mình chưa có dữ liệu" —
# không lỗi, không log. Khách hỏi giờ mở cửa và AI nói không biết, dù dữ liệu nằm trong repo.
#
# Bất biến này được ép trong `ai/app/test_packaging.py`: test đọc chính Dockerfile này và đối
# chiếu với đường dẫn mà mã lúc chạy thật sự dùng, nên xóa dòng dưới là test đỏ ngay.
#
# Issue #57 — hai tệp này TỪNG nằm ở `backend/data/`, và chú thích cũ ở đây nói chúng "thuộc về
# backend (chúng seed cơ sở dữ liệu qua migration EF)". Câu đó SAI: backend .NET chỉ nhắc tới
# chúng trong chú thích migration, dữ liệu seed đã nhúng thẳng vào mã migration, không có chỗ nào
# đọc tệp. Ba nơi ĐỌC thật là dịch vụ AI, test từ điển nhãn của frontend, và phép thăm dò ngữ
# nghĩa trong `deploy/scripts/health-check.sh`. Chúng là dữ liệu sản phẩm dùng chung nên ở gốc
# repo — không nhét vào `ai/`, vì làm vậy sẽ nói sai về quyền sở hữu theo chiều ngược lại và buộc
# frontend với tay vào thư mục của dịch vụ AI.
#
# Kho tri thức thì KHÔNG cần dòng này — nó đã được gộp vào `ai/knowledge/`, tức nằm trong phạm vi
# `COPY ai` ở trên. Đó là cách sửa bằng cấu trúc, không phải bằng việc nhớ thêm một dòng COPY.
COPY --chown=app:app data ./data

# TÍNH SẴN vector của kho tri thức, lúc BUILD.
#
# Đo trong container thật: khởi động mất 97,3 giây, và 61,7 giây trong đó là mã hóa 425 đoạn — 64%.
# Kho tri thức nằm cố định trong ảnh, nên 61,7 giây đó tính đi tính lại CÙNG một kết quả mỗi lần
# container khởi động. Nó thuộc lúc build.
#
# Hậu quả thứ hai của 97 giây, tệ hơn chậm: `HEALTHCHECK` dưới đây có `start_period=15s`,
# `interval=30s`, `retries=3`, nên lần kiểm thứ ba rơi vào ~105 giây. Dịch vụ kịp sẵn sàng ở 97 giây,
# tức **suýt** bị đánh `unhealthy` — và `api` có `depends_on: condition: service_healthy`, nên một
# máy chậm hơn 8% làm cả stack không lên được.
#
# `AI_EMBEDDING_CACHE` đặt ở đây và KHÔNG có giá trị mặc định trong mã: mã tự đoán một đường dẫn thì
# lúc build ghi chỗ này, lúc chạy đọc chỗ khác, và hậu quả là im lặng tính lại 61 giây trong khi mọi
# người tin là đã có đệm. Xem `ai/app/rag/embedding.py`.
#
# Tệp đệm mang HÀM BĂM nội dung đã mã hóa, nên kho đổi mà quên chạy lại bước này thì lúc chạy khóa
# không khớp và hệ thống TỰ tính lại — chậm, nhưng ĐÚNG. Không có nhánh nào dùng vector lệch dữ liệu.
# Gọi `python -m rag.precompute`, KHÔNG viết phép lọc đoạn ở đây.
#
# Bản đầu của dòng này là một biểu thức inline gọi `retrievable_chunks(...)` — 425 đoạn — trong khi
# lúc chạy `answer.py` xếp hạng tập ĐÃ LỌC `heading`. Hai tập khác nhau nên hàm băm nội dung khác
# nhau, đệm không khớp, và container **mã hóa lại toàn bộ mỗi lần khởi động**: 60 giây, trong khi log
# build in "đã ghi ... cho 425 đoạn" và mọi dấu hiệu nói là đã có đệm.
#
# Đệm làm đúng thiết kế — khóa lệch thì tính lại chứ tuyệt đối không dùng vector sai — nên nó im lặng
# làm điều đúng và che mất việc nó chưa từng được dùng. Chỉ đo thời gian khởi động thật mới thấy.
#
# Mô-đun `rag.precompute` gọi cùng hàm `doan_toan_kho()` mà `answer.py` gọi, nên hai bên không lệch
# được nữa. Đây là cách sửa bằng cấu trúc, không phải bằng việc nhớ sửa hai chỗ.
ENV AI_EMBEDDING_CACHE=/opt/hf/corpus-vectors.json

# CHẶN mọi lần gọi mạng ra Hugging Face — kể từ ĐÂY, tức TRƯỚC `rag.precompute`, không chỉ lúc chạy.
#
# Mô hình đã nằm trong ảnh, nên một lần kiểm phiên bản là thuần rủi ro: mạng chậm thì nó làm chậm
# khởi động, mạng chặn thì nó có thể làm hỏng.
#
# LỖI CÓ THẬT, đo trên ảnh dựng xong. Hai dòng này trước đây nằm SAU `rag.precompute`, nên bước ấy
# còn ra mạng được — và nó ra thật:
#
#     snapshots/5617a9f6…/pytorch_model.bin   2,27GB   <- snapshot_download, nhánh main
#     snapshots/9a0624b8…/model.safetensors   2,27GB   <- rag.precompute, refs/pr/130
#
# `transformers` ưu tiên safetensors; nhánh `main` của `BAAI/bge-m3` KHÔNG có, nên nó lấy từ PR
# chuyển đổi tự động `refs/pr/130`. Kết quả: HAI bộ trọng số của CÙNG một mô hình, và việc loại bỏ
# bộ ONNX ở trên không tiết kiệm được byte nào — `/opt/hf` vẫn 4,3GB, y hệt trước khi sửa.
#
# Bằng chứng rằng chặn là đủ, không cần đổi mã: bước ở trên đã nạp `SentenceTransformer` NGOẠI
# TUYẾN thành công từ `pytorch_model.bin` đã cache. Ngoại tuyến thì `transformers` không hỏi Hub
# được nữa và dùng đúng bộ đã có.
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1

# `cd /app/ai/app` là bắt buộc để `python -m rag.precompute` tìm được gói `rag` — cùng lý do với
# `--app-dir app` của `CMD` ở cuối tệp: mọi mô-đun trong `ai/app` dùng import PHẲNG.
RUN cd /app/ai/app && python -m rag.precompute && chmod -R a+rX /opt/hf

# Sau khi đệm đã ghi xong: trong ảnh chỉ được còn ĐÚNG MỘT bộ trọng số. Bước này làm lỗi trên
# không thể quay lại âm thầm — nó sẽ làm HỎNG build thay vì lặng lẽ phình thêm 2,27GB.
RUN so=$(find /opt/hf -type f -size +1G | wc -l); \
    echo "so tep trong so >1GB: $so"; find /opt/hf -type f -size +1G -printf '  %s %p\n'; \
    du -sh /opt/hf; \
    if [ "$so" -ne 1 ]; then echo "PHAI co dung 1 bo trong so, dang co $so"; exit 1; fi

WORKDIR /app/ai

ENV AI_SERVICE_HOST=0.0.0.0
ENV AI_SERVICE_PORT=8001

USER app

# Kiểm tra sức khỏe dùng `/health` chứ không dùng `/ready`. Hai endpoint khác nhau có chủ ý:
# `/health` chỉ nói tiến trình còn sống, `/ready` mới kiểm dữ liệu. Nếu healthcheck dùng `/ready`
# thì một lỗi dữ liệu sẽ làm orchestrator khởi động lại container liên tục — mà khởi động lại
# không sửa được lỗi dữ liệu.
#
# `start-period` 15s -> 90s, vì tầng embedding đổi thời gian khởi động và 15s đã thành SAI
# ---------------------------------------------------------------------------------------
# Đo được: khởi động 97,3 giây trước khi có đệm vector, và 19,0 giây sau khi có — con số 19,0 là lần
# khởi động lại thứ hai, khi đĩa đã nóng; lần đầu ngay sau khi build là 61,9 giây, nên "19 giây" chỉ
# đúng cho container khởi động lại. Với 15s + 30s × 3 lần
#
# ("~35 giây" là con số em ĐOÁN ở bản đầu của chú thích này, trước khi bấm giờ. Đo ra 19,0s. Cùng lớp
# với "khoảng 2–3GB" cho ảnh Docker mà đo ra 9,29GB rồi 2,74GB: một con số không đo thì sai cả về
# hướng lẫn về độ lớn, và nó vẫn đọc như một con số.)
# thì lần kiểm thứ ba rơi vào ~105 giây, tức bản chưa có đệm **suýt** bị đánh `unhealthy`. Và `api`
# có `depends_on: ai-service: condition: service_healthy`, nên hậu quả không phải "một cảnh báo" mà
# là **cả stack không lên**.
#
# Đặt 90s chứ không phải 40s: `start-period` chỉ nói "trong khoảng này thất bại thì đừng tính", nó
# KHÔNG làm chậm gì khi dịch vụ lên nhanh — lần kiểm đầu vẫn chạy đúng lịch và container thành
# `healthy` ngay khi `/health` trả lời. Nên đặt rộng là không mất gì, còn đặt sát là đánh cược vào
# việc máy chạy production không chậm hơn máy đã đo.
#
# Lý do ghi lại: cùng lớp lỗi với `HF_HUB_OFFLINE` và với `AI_EMBEDDING_CACHE` — thêm một tầng vào
# lúc khởi động thì mọi con số về khởi động phải được xem lại, không chỉ con số bị nhắc tới.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD python -c "import urllib.request,os,sys; \
sys.exit(0 if b'\"ok\":true' in urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('AI_SERVICE_PORT','8001')+'/health', timeout=3).read().replace(b' ',b'') else 1)"

# Điểm vào là `app/service.py`, và `--app-dir app` là BẮT BUỘC — không phải tùy chọn cho gọn.
#
# Mọi mô-đun trong `ai/app` dùng import PHẲNG (`from answer import ...`, `from understand import
# ...`), nên `ai/app` phải nằm trong `sys.path`. Test qua được vì chúng tự thêm đường dẫn đó;
# uvicorn thì không. Gọi `uvicorn app.service:app` từ `/app/ai` cho:
#
#     ModuleNotFoundError: No module named 'answer'
#
# Tức container KHỞI ĐỘNG THẤT BẠI, và ba dòng trước đó (torch, sentence_transformers, app.main)
# cũng vậy. Phát hiện được chỉ vì chạy uvicorn thật, không phải vì test — `test_packaging.py` nay
# CHẠY THỬ IMPORT trong tiến trình riêng với đúng `sys.path` mà container có.
CMD ["sh", "-c", "uvicorn service:app --app-dir app --host ${AI_SERVICE_HOST:-0.0.0.0} --port ${AI_SERVICE_PORT:-8001}"]
