# -*- coding: utf-8 -*-
"""Chạy ĐÚNG những phép khẳng định của `deploy/scripts/health-check.sh`, nhưng ở CI.

    python ai/evaluation/run_deploy_probes.py

Vì sao bộ này tồn tại
---------------------
`health-check.sh` là phép kiểm cuối cùng của một lần deploy, và nó chỉ chạy **trên staging** — tức nó
chỉ đỏ SAU khi đã merge, đã đẩy, đã dựng ảnh và đã thay container. Vòng phản hồi đó là vòng dài nhất
trong dự án, và nó đã đỏ **hai lần liên tiếp**:

    lần 1   phép kiểm hỏi trường của hệ thống CŨ (`pipeline_profile`, `model_policy`, ...)
    lần 2   khách hỏi "có PHỞ không" mà thẻ giỏ có 4 món BÚN, vì "phở" ánh xạ tới danh mục
            `cat_noodle` — mà danh mục ấy tên là "Phở & Bún"

Lần thứ hai là điều đáng nói: **103 lượt golden, 140 ca và 87 lượt phiên đều xanh** trên đúng bản có
lỗi đó. Ba câu thử của phép kiểm deploy tồn tại từ hệ thống CŨ, do người khác viết cho mục đích khác,
nên chúng hỏi khác đi — và chính vì thế chúng bắt được thứ ba tập kia không bắt.

Kết luận về TẬP ĐÁNH GIÁ, không phải về hệ thống: một tập do một người viết mang đúng thiên lệch của
người đó. Cách phá thiên lệch không phải viết thêm ca cùng kiểu mà là **lấy câu từ nguồn khác**.

Không sao chép phép khẳng định — BÓC từ script
---------------------------------------------
Nếu bộ này viết lại các phép khẳng định thì nó thành **đầu thứ hai** của cùng một bất biến, và dự án
đã trả giá tám lần cho đúng chuyện đó. Nên nó đọc `health-check.sh`, bóc các khối Python nội tuyến, và
chạy lại **nguyên văn**. Lệch được thì đã không cần nó.

Mã thoát: 0 nếu mọi khối đạt, 1 nếu có khối đỏ, 2 nếu không gọi được dịch vụ.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
SCRIPT = REPO_ROOT / "deploy" / "scripts" / "health-check.sh"
MENU = REPO_ROOT / "data" / "menu-dataset.json"

# Ba câu thử, LẤY NGUYÊN từ `health-check.sh`. Bóc bằng mẫu để chúng không lệch được: thêm một câu
# thử vào script mà quên ở đây thì CI không kiểm nó, và đó lại là một đầu bị bỏ.
_PROBE_RE = re.compile(r'run_semantic_probe "([^"]+)" "([^"]+)"')


def cau_thu() -> list[tuple[str, str]]:
    return _PROBE_RE.findall(SCRIPT.read_text(encoding="utf-8"))


def khoi_python(script: str) -> list[str]:
    return re.findall(r"<<'PY'\n(.*?)\nPY\n", script, re.DOTALL)


def goi(base: str, duong_dan: str, payload=None, token: str = "") -> dict:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(base + duong_dan, data=data)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def chay_khoi(ma: str, argv: list[str]) -> tuple[bool, str]:
    """Chạy một khối Python của script như script chạy nó: đối số dòng lệnh, `assert` là kết quả."""
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
        f.write(ma)
        duong = f.name
    p = subprocess.run(
        [sys.executable, duong, *argv],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return p.returncode == 0, (p.stderr or "").strip()


def main(argv: list[str] | None = None) -> int:
    cong = os.environ.get("AI_SERVICE_PORT", "8001")
    base = os.environ.get("AI_BASE_URL") or f"http://127.0.0.1:{cong}"
    token = (os.environ.get("AI_INTERNAL_TOKEN") or "").strip()

    if not SCRIPT.exists():
        print(f"CHẶN: không có {SCRIPT.relative_to(REPO_ROOT)} — phép kiểm deploy đã biến mất?")
        return 1

    script = SCRIPT.read_text(encoding="utf-8")
    khoi = khoi_python(script)
    k_ready = [k for k in khoi if "expected_retriever" in k]
    k_chat = [k for k in khoi if "suggested_cart_actions" in k]
    if len(k_ready) != 1 or len(k_chat) != 1:
        print(f"CHẶN: bóc sai khối từ health-check.sh ({len(k_ready)} ready, {len(k_chat)} chat).")
        print("  Script đã đổi hình dạng — cập nhật bộ bóc, đừng bỏ bước này.")
        return 1

    probes = cau_thu()
    if not probes:
        print("CHẶN: không bóc được câu thử nào từ health-check.sh.")
        return 1

    print(f"BA CÂU THỬ CỦA PHÉP KIỂM DEPLOY — chạy ở CI thay vì chờ tới staging\n")
    print(f"  dịch vụ   : {base}")
    print(f"  câu thử   : {len(probes)} câu, bóc từ deploy/scripts/health-check.sh")

    sys.path.insert(0, str(HERE))
    import verify_deploy_config as gate  # noqa: E402

    try:
        ready = goi(base, "/ready")
    except (urllib.error.URLError, OSError) as e:
        print(f"\nKHÔNG gọi được dịch vụ AI: {e}")
        print("  Dựng stack trước: docker compose -f deploy/docker-compose.yml up -d")
        return 2

    tmp = Path(tempfile.mkdtemp())
    xau = 0

    rp = tmp / "ready.json"
    rp.write_text(json.dumps(ready, ensure_ascii=False), encoding="utf-8")
    ok, err = chay_khoi(k_ready[0], [
        str(rp), str(ready.get("model") or ""), gate.bo_truy_hoi_se_deploy(),
        "true" if gate.duong_sinh_se_bat() else "false",
    ])
    print(f"\n  {'[ok]  ' if ok else '[ĐỎ]  '}khối /ready"
          f"  (retriever={ready.get('retriever')}, generation={ready.get('generation_enabled')})")
    if not ok:
        xau += 1
        print("        " + err.replace("\n", "\n        ")[-1800:])

    raw = json.loads(MENU.read_text(encoding="utf-8-sig"))
    menu_items = [
        {
            "id": i["id"], "name": i["name"], "description": i.get("description") or "",
            "category_id": i.get("categoryId") or "", "category_name": i.get("categoryName") or "",
            "price_vnd": i.get("price"), "tags": i.get("tags") or [],
            "is_available": bool(i.get("isAvailable", True)),
        }
        for i in raw["items"]
    ]

    for ten, cau in probes:
        payload = {
            "contract_version": "v2",
            "message": cau,
            "session_id": f"deploy-smoke-{ten}",
            "session_state": {
                "facts": [], "constraints": {}, "memory_version": "v3",
                "conversation_frame": {"turn_sequence": 0},
            },
            "live_context": {"menu_items": menu_items, "table_code": "SMOKE"},
        }
        try:
            body = goi(base, "/v1/chat", payload, token)
        except (urllib.error.URLError, OSError) as e:
            print(f"  [ĐỎ]  {ten}: không gọi được /v1/chat: {e}")
            xau += 1
            continue

        rp = tmp / f"{ten}.json"
        rp.write_text(json.dumps(body, ensure_ascii=False), encoding="utf-8")
        ok, err = chay_khoi(k_chat[0], [str(rp), str(MENU), ten])
        gio = [a.get("name") for a in body.get("suggested_cart_actions") or []]
        print(f"  {'[ok]  ' if ok else '[ĐỎ]  '}{ten:16} {cau}")
        print(f"        {(body.get('decision') or {}).get('kind')} · thẻ giỏ: {gio}")
        if not ok:
            xau += 1
            print("        " + err.replace("\n", "\n        ")[-1500:])

    print()
    if xau:
        print(f"{xau} khối ĐỎ. Phép kiểm này chạy y nguyên trên staging, nên deploy sẽ đỏ như vậy.")
        return 1
    print("Mọi khối đạt. Phép kiểm sức khỏe của deploy sẽ đạt trên cùng cấu hình.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
