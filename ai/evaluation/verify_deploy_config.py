# -*- coding: utf-8 -*-
"""FAIL CLOSED khi cấu hình sắp deploy KHÁC cấu hình mà phép đo đã chạy trên đó.

    python ai/evaluation/verify_deploy_config.py            # dùng biến môi trường hiện có
    python ai/evaluation/verify_deploy_config.py --moi-truong staging

Thay cho `verify_pipeline_selection.py` của hệ thống cũ
------------------------------------------------------
Bản cũ có một cổng deploy với đúng mục đích này — docstring của nó viết *"Fail closed when runtime
configuration drifts from the research winner."* Nó đọc `ai/evaluation/approved/pipeline_selection.json`
và đối chiếu với `PIPELINE_PROFILES`, `DEFAULT_LLM_MODEL` của bản cũ.

Bản dựng lại đã bỏ toàn bộ khái niệm "pipeline profile", nên cổng đó không còn chạy được — và cả hai
workflow deploy vẫn gọi nó. Đẩy lên `develop` hay `main` là **deploy thất bại ngay ở bước đó**.

Cách sửa KHÔNG phải bỏ bước đi. Bỏ một cổng deploy là bỏ im lặng một hàng rào, và dự án này có luật
riêng về việc đó: *tiêu chí chết còn tệ hơn không có tiêu chí* — nhưng **cổng bị xóa còn tệ hơn cả
hai**, vì không ai thấy nó biến mất.

Cổng này hỏi đúng câu hỏi của bản cũ, bằng dữ liệu của bản mới
-------------------------------------------------------------
Bản cũ hỏi: *"cấu hình runtime có khớp bản nghiên cứu thắng không?"*
Bản mới hỏi: **"cấu hình sắp deploy có phải cấu hình mà phép đo đã chạy trên đó không?"**

Nguồn bằng chứng là `ai/evaluation/measurements/golden_e2e.json` — bản ghi lần chạy golden qua HTTP
thật, và nó mang **nguyên phản hồi `/ready`** của dịch vụ lúc đo. Nhờ vậy cổng so được hai đầu:

    bằng chứng nói      đo trên retriever=X, generation=Y, và có Z lượt đỏ
    sắp deploy là       retriever=X', generation=Y'
    X != X' hoặc Y != Y' hoặc Z > 0   ->  CHẶN

Vì sao suy `retriever` từ `requirements.txt` chứ không từ biến môi trường
------------------------------------------------------------------------
Không có biến môi trường nào chọn bộ truy hồi. `answer._bo_truy_hoi_toan_kho()` dùng embedding **nếu
`sentence-transformers` import được**, tức nó do NỘI DUNG ẢNH quyết định, và ảnh do `requirements.txt`
quyết định. Nên đọc `requirements.txt` là đọc đúng thứ quyết định.

Đây cũng là điều làm cổng này có ích thật: bỏ `sentence-transformers` khỏi requirements mà quên đo lại
là một thay đổi lớn về chất lượng (Hit@1 niêm phong 0,609 -> 0,391) và **không phép kiểm nào khác bắt**.

Điều cổng này KHÔNG làm
-----------------------
Nó không tự chạy golden — chạy golden cần cả stack và một khóa mô hình thật, không hợp với một bước
deploy. Nó chỉ đối chiếu **bằng chứng đã ghi** với **cấu hình sắp dùng**, và in ngày đo ra để người
đọc tự thấy bằng chứng cũ tới đâu.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
REQUIREMENTS = REPO_ROOT / "ai" / "requirements.txt"


def bo_truy_hoi_se_deploy() -> str:
    """Bộ truy hồi mà ẢNH sắp deploy sẽ chạy, suy từ `requirements.txt`."""
    if not REQUIREMENTS.exists():
        return "khong-doc-duoc-requirements"
    lines = [
        line.split("#")[0].strip()
        for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines()
    ]
    co = any(line.lower().startswith("sentence-transformers") for line in lines if line)
    return "embedding" if co else "bm25"


_BAT = {"1", "true", "yes", "on"}
# Bản .NET đã xoá (#59), nên tệp compose duy nhất còn lại là bản Java.
#
# Đáng nói vì nó suýt hỏng ÂM THẦM: `duong_sinh_se_bat()` trả về False khi tệp không tồn tại, nên
# sau khi xoá `docker-compose.yml` cổng này vẫn chạy và vẫn "có kết luận" — chỉ là kết luận sai
# (đối chiếu với bằng chứng của cấu hình TẮT trong khi cấu hình thật là BẬT). Đúng cái lỗi mà
# docstring của chính hàm đó mô tả, lặp lại vì một lý do khác.
COMPOSE = REPO_ROOT / "deploy" / "docker-compose.java.yml"


def duong_sinh_se_bat() -> bool:
    """Đường sinh có bật không — đọc đúng thứ QUYẾT ĐỊNH, không đọc thứ tiện đọc.

    Thứ quyết định là mặc định trong `docker-compose.java.yml`:

        AI_ENABLE_GENERATION: ${AI_ENABLE_GENERATION:-1}

    `deploy-vps.sh` KHÔNG ghi biến này vào `.env` trên máy chủ (đã kiểm), nên trên môi trường thật
    mặc định của compose là giá trị duy nhất có hiệu lực. Biến môi trường vẫn thắng nếu ai đó đặt
    tường minh — đó là cách tắt lại.

    Bản trước CHỈ đọc biến môi trường, và đó là một lỗi im lặng chờ xảy ra: sau khi mặc định compose
    đổi thành BẬT, cổng vẫn thấy biến rỗng nên nó đối chiếu với bằng chứng của cấu hình TẮT — tức
    xác nhận một cấu hình khác với cấu hình sắp chạy, và báo "khớp".

    Cùng nguyên tắc với `bo_truy_hoi_se_deploy()`: bộ truy hồi do `requirements.txt` quyết định nên
    hàm đó đọc `requirements.txt`. Đọc đúng nguồn quyết định là điều làm một cổng có ích thật.
    """
    moi_truong = (os.environ.get("AI_ENABLE_GENERATION") or "").strip().lower()
    if moi_truong:
        return moi_truong in _BAT

    if not COMPOSE.exists():
        return False
    khop = re.search(
        r"AI_ENABLE_GENERATION:\s*\$\{AI_ENABLE_GENERATION:-([^}]*)\}",
        COMPOSE.read_text(encoding="utf-8"),
    )
    return bool(khop) and khop.group(1).strip().lower() in _BAT


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--moi-truong", default="", help="tên môi trường, chỉ để in ra")
    p.add_argument(
        "--chi-bo-truy-hoi",
        action="store_true",
        help="in ĐÚNG tên bộ truy hồi sắp deploy rồi thoát, không kiểm gì",
    )
    args = p.parse_args(argv)

    # Chế độ in một dòng, cho báo cáo deploy.
    #
    # Vì sao cần: hai workflow deploy từng in `- Pipeline profile: ${AI_PIPELINE_PROFILE}` — một biến
    # của hệ thống cũ mà không mô-đun nào đọc, nên dòng báo cáo đó nói về thứ không tồn tại. Thay
    # bằng thứ THẬT quyết định chất lượng truy hồi, và lấy từ cùng một hàm mà cổng dùng, để dòng báo
    # cáo không thể lệch khỏi thứ sắp chạy.
    if args.chi_bo_truy_hoi:
        print(bo_truy_hoi_se_deploy())
        return 0

    sys.path.insert(0, str(HERE))
    import results  # noqa: E402

    nhan = f" [{args.moi_truong}]" if args.moi_truong else ""
    print(f"CỔNG DEPLOY{nhan} — cấu hình sắp dùng có khớp cấu hình đã ĐO không?\n")

    # Chọn tệp bằng chứng THEO CẤU HÌNH sắp deploy, không lấy "lần chạy gần nhất".
    #
    # `run_golden_e2e.py` ghi `golden_e2e.json` khi đường sinh tắt và `golden_e2e_sinh.json` khi bật —
    # cùng một phép suy, ở hai đầu. Nếu chỉ có một tệp cho mọi cấu hình thì lần chạy sau xóa bằng
    # chứng của cấu hình trước, và cổng này đối chiếu với bằng chứng của một hệ thống khác.
    ten = "golden_e2e_sinh" if duong_sinh_se_bat() else "golden_e2e"
    try:
        r = results.doc(ten)
    except FileNotFoundError as e:
        print(str(e))
        print(f"\nCHẶN: chưa có bằng chứng cho cấu hình sắp deploy "
              f"(generation_enabled={duong_sinh_se_bat()}).")
        print("Chạy golden trên ĐÚNG cấu hình đó rồi commit tệp kết quả.")
        return 1

    so, dk = r["so"], r["dieu_kien"]
    ready = dk.get("ready") if isinstance(dk.get("ready"), dict) else {}

    da_do_retriever = ready.get("retriever")
    da_do_sinh = ready.get("generation_enabled")
    se_retriever = bo_truy_hoi_se_deploy()
    se_sinh = duong_sinh_se_bat()

    print(f"  bằng chứng : golden {so['dat']}/{so['luot']} lượt, đo ngày {dk.get('ngay')}")
    print(f"               retriever={da_do_retriever} · generation_enabled={da_do_sinh}")
    print(f"  sắp deploy : retriever={se_retriever} · generation_enabled={se_sinh}\n")

    van_de: list[str] = []
    if so.get("do", 0) > 0:
        van_de.append(
            f"lần đo gần nhất còn {so['do']} lượt ĐỎ — không deploy một cấu hình chưa xanh"
        )
    if da_do_retriever != se_retriever:
        van_de.append(
            f"bộ truy hồi lệch: đo trên {da_do_retriever!r}, sắp deploy {se_retriever!r}. "
            "Chênh lệch giữa hai bộ là 21,8 điểm Hit@1 trên tập niêm phong — đây không phải chi tiết."
        )
    if bool(da_do_sinh) != se_sinh:
        van_de.append(
            f"đường sinh lệch: đo với generation_enabled={da_do_sinh}, sắp deploy {se_sinh}. "
            "Hai cấu hình cho hai hành vi khác nhau — một bên chữ do khuôn mẫu dựng, một bên do mô "
            "hình viết."
        )

    if van_de:
        print(f"CHẶN ({len(van_de)} vấn đề):")
        for v in van_de:
            print(f"  - {v}")
        print("\nChạy lại golden trên đúng cấu hình sắp deploy, rồi commit "
              "`ai/evaluation/measurements/golden_e2e.json`.")
        return 1

    print("Khớp. Bằng chứng nói cấu hình này đã chạy xanh qua chuỗi gọi đầy đủ.")
    print("Lưu ý: cổng này KHÔNG chạy lại golden — nó đối chiếu bằng chứng đã ghi. Ngày đo ở trên.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
