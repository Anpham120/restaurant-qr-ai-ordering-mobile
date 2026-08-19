# -*- coding: utf-8 -*-
"""Ablation bộ nhớ phiên: chạy tập kịch bản CÓ và KHÔNG ghép ngữ cảnh, rồi so.

    python ai/evaluation/run_ablation_bo_nho.py
    python ai/evaluation/run_ablation_bo_nho.py --ghi

Vì sao có tệp này
-----------------
Báo cáo trích con số "bỏ bộ nhớ thì 34 trong 163 lượt hỏng" ở **bốn chỗ**, nhưng
phép đo sinh ra nó không tồn tại dưới dạng script — nó được chạy tay một lần rồi
chép vào văn bản. Hệ quả: tập kịch bản mở rộng từ 163 lên 175 lượt mà con số vẫn
đứng yên, và không có cách nào biết nó đã cũ ngoài việc nhớ ra.

Một cơ chế chỉ đáng giữ khi tắt nó đi thì đo được mức mất. Nếu tắt bộ nhớ mà
không lượt nào hỏng thì bộ nhớ là dư, và phải nói ra điều đó.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GOC = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(GOC / "ai" / "app"))

import answer                                    # noqa: E402
import session as S                              # noqa: E402
from understand import understand                # noqa: E402
from run_session_eval import cham_luot, _theo_id  # noqa: E402

MENU = json.loads((GOC / "data" / "menu-dataset.json")
                  .read_text(encoding="utf-8-sig"))
ITEMS = MENU["items"]


def chay(script: dict, co_bo_nho: bool) -> list[dict]:
    """Chạy một kịch bản. `co_bo_nho=False` là nhánh ablation.

    Ablation KHÔNG phải là "xoá state" — state vẫn được cập nhật để `refers_to_turn`
    hoạt động. Nó chỉ bỏ đúng một bước: ghép ngữ cảnh cũ vào Request của lượt mới.
    Bỏ nhiều hơn thì đo lẫn thứ khác vào.
    """
    theo_id = _theo_id(ITEMS)
    state = S.SessionState()
    ghi: list[dict] = []
    for turn in script["turns"]:
        req = understand(turn["user"], ITEMS)
        merged = S.merge_into_request(req, state) if co_bo_nho else req
        reply = answer.respond(merged, ITEMS)
        state = S.update_state(state, merged, list(reply.items), reply.kind, reply.branch)
        ghi.append({
            "user": turn["user"], "expect": turn.get("expect", {}),
            "request": merged, "reply": reply, "state": state,
            "items": [theo_id[i] for i in reply.items if i in theo_id],
            "menu": ITEMS,
        })
    return ghi


def _cham(kich_ban: list[dict], co_bo_nho: bool) -> dict:
    tong = do = 0
    hong: list[str] = []
    for s in kich_ban:
        truoc: list[dict] = []
        for bg in chay(s, co_bo_nho):
            ly_do = cham_luot(bg, truoc)
            truoc.append(bg)
            tong += 1
            if ly_do:
                do += 1
                hong.append(f'{s["id"]} · "{bg["user"][:44]}" → {ly_do[0][:64]}')
    return {"tong": tong, "do": do, "hong": hong}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ghi", action="store_true")
    ap.add_argument("--chi-tiet", action="store_true")
    a = ap.parse_args()

    kb = json.loads((HERE / "session_scripts.json").read_text(encoding="utf-8-sig"))
    kich_ban = kb["scripts"]

    co = _cham(kich_ban, True)
    khong = _cham(kich_ban, False)
    mat = khong["do"] - co["do"]

    print(f"tập kịch bản: {len(kich_ban)} kịch bản / {co['tong']} lượt\n")
    print(f"  CÓ bộ nhớ    : {co['tong'] - co['do']:3}/{co['tong']} đạt "
          f"({co['do']} lượt đỏ)")
    print(f"  KHÔNG bộ nhớ : {khong['tong'] - khong['do']:3}/{khong['tong']} đạt "
          f"({khong['do']} lượt đỏ)")
    print(f"\n  mức mất khi tắt bộ nhớ: {mat} lượt "
          f"({100.0 * mat / co['tong']:.1f}% của tập)")

    if a.chi_tiet:
        print("\nlượt hỏng khi TẮT bộ nhớ:")
        for h in khong["hong"][:40]:
            print("   " + h)

    if a.ghi:
        ra = HERE / "measurements" / "ablation_bo_nho.json"
        ra.parent.mkdir(exist_ok=True)
        ra.write_text(json.dumps({
            "dieu_kien": {
                "ngay": __import__("datetime").date.today().isoformat(),
                "sinh_boi": "ai/evaluation/run_ablation_bo_nho.py --ghi",
                "so_kich_ban": len(kich_ban),
                "ghi_chu": "Ablation bỏ ĐÚNG bước merge_into_request; state vẫn cập nhật.",
            },
            "so": {"co_bo_nho": {"tong": co["tong"], "do": co["do"]},
                   "khong_bo_nho": {"tong": khong["tong"], "do": khong["do"]},
                   "mat": mat,
                   "mat_phan_tram": round(100.0 * mat / co["tong"], 1)},
            "luot_hong_khi_tat": khong["hong"],
        }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\nđã ghi {ra.relative_to(GOC)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
