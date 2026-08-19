# -*- coding: utf-8 -*-
"""Chạy 25 kịch bản hội thoại đa lượt — đo BỘ NHỚ PHIÊN, thứ 119 ca không đo được.

Vì sao cần bộ chạy riêng chứ không mở rộng `run_baseline.py`
------------------------------------------------------------
119 ca hiện có đều **một lượt**: mỗi ca gọi `understand()` một lần trên một câu hỏi rồi chấm câu
trả lời. Cấu trúc đó **không thể** bắt được lỗi bộ nhớ, vì lỗi bộ nhớ chỉ hiện ra ở lượt thứ hai
trở đi. Cụ thể lỗi tệ nhất của phần này:

    lượt 1   "Mình dị ứng hải sản"        -> hệ thống hiểu, lọc đúng
    lượt 2   "Cho mình món không cay"     -> câu này KHÔNG nhắc dị ứng
             nếu bộ nhớ quên -> hệ thống mời món hải sản cho người dị ứng

Và lượt 2 nhìn hoàn toàn vô hại. Không ai đọc log mà nghi câu đó.

Hai điều mỗi lượt kiểm, và vì sao phải là HAI
---------------------------------------------
    câu trả lời   không có món mang nhãn bị cấm
    bộ nhớ        SAU lượt đó còn giữ ràng buộc

Chỉ kiểm câu trả lời thì một hệ thống **đã quên** dị ứng nhưng tình cờ không gợi món hải sản
(vì khách vừa hỏi món tráng miệng) vẫn qua — và nó sẽ đỏ ở một lượt khác, ngẫu nhiên. Kiểm cả bộ
nhớ biến lỗi ngẫu nhiên thành lỗi tất định.

Ba mức kết quả, không phải hai
------------------------------
    CHẶN          nhóm `allergy_persists` đỏ. Một lượt mời món gây dị ứng là chặn phát hành,
                  không phải trừ điểm. Mã trả về khác 0.
    ĐỎ            lượt không đạt tiêu chí. Số này báo cáo được.
    KHOẢNG CÁCH   lượt `aspirational: true` — hệ thống chưa làm được và tập ca NÓI RA điều đó
                  thay vì bỏ ca ra. Không chặn, nhưng phải đếm và phải in.

`aspirational` mà không kèm tiêu chí đo được thì vô nghĩa: không có gì để đỏ nên ca luôn qua, và
bảng kết quả trông như đã bao phủ. Bộ chạy này **từ chối** lượt như vậy — xem `_kiem_tieu_chi`.

    python ai/evaluation/run_session_eval.py            # bảng tóm tắt
    python ai/evaluation/run_session_eval.py --chi-tiet # in từng lượt đỏ
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
sys.path.insert(0, str(REPO_ROOT / "ai" / "app"))

import answer  # noqa: E402
import session as S  # noqa: E402
from understand import understand  # noqa: E402

SCRIPTS_PATH = HERE / "session_scripts.json"
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"

# Nhóm CHỐT AN TOÀN. Đỏ ở đây là CHẶN, không phải số liệu.
GATE_GROUPS = ("allergy_persists",)

# Khóa `expect` bộ chạy này hiểu. Khóa lạ là LỖI, không phải bị bỏ qua im lặng — một tiêu chí
# viết sai tên khóa sẽ không bao giờ chạy, và ca đó lặng lẽ luôn xanh. Bản trước của tập đánh giá
# truy hồi có 96 khóa đáp án trỏ sai chỗ suốt nhiều tháng vì đúng cơ chế im lặng này.
KHOA_HIEU = frozenset({
    "why",
    "aspirational",
    "forbid_tags_any",
    "min_items",
    "max_items",
    "expect_kind",
    "must_name_item",
    "must_say_any",
    "must_say_all",
    "must_not_say_any",
    "refers_to_turn",
    "refers_to_position",
    "must_not_repeat_turn",
    "must_match_turn_constraint",
    "memory_must_have_avoid",
    "memory_must_not_have_avoid",
    "memory_must_have_require",
    "memory_must_not_have_require",
    "memory_budget_max",
    "memory_wants",
    "memory_remembers_suggested",
    "expect_branch_prefix",
})

# Khóa CHỈ mang chú thích, không phải tiêu chí. Một lượt chỉ có những khóa này thì nó không đo gì.
KHOA_KHONG_DO = frozenset({"why", "aspirational"})


def load_menu() -> list[dict]:
    return json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))["items"]


def _theo_id(items: list[dict]) -> dict[str, dict]:
    return {i["id"]: i for i in items}


def _kiem_tieu_chi(script: dict) -> list[str]:
    """Bắt tiêu chí viết sai TRƯỚC khi chạy. Hai loại lỗi, cả hai đều làm ca luôn xanh."""
    loi: list[str] = []
    for j, turn in enumerate(script["turns"], 1):
        exp = turn.get("expect", {})
        la = sorted(set(exp) - KHOA_HIEU)
        if la:
            loi.append(
                f"{script['id']} lượt {j}: khóa `expect` bộ chạy không hiểu: {la}. "
                "Tiêu chí sai tên khóa thì nó KHÔNG BAO GIỜ chạy và lượt lặng lẽ luôn xanh"
            )
        if not (set(exp) - KHOA_KHONG_DO):
            loi.append(
                f"{script['id']} lượt {j}: `expect` chỉ có {sorted(exp)} — không có tiêu chí nào "
                "ĐO ĐƯỢC, nên lượt này luôn qua. `aspirational` nói ca ĐƯỢC PHÉP đỏ, nó không "
                "thay cho tiêu chí"
            )
        if exp.get("refers_to_position") is not None:
            dat = exp["refers_to_position"]
            if (not isinstance(dat, dict) or not isinstance(dat.get("turn"), int)
                    or not isinstance(dat.get("index"), int)
                    or not 1 <= dat["turn"] < j or dat["index"] < 1):
                loi.append(
                    f"{script['id']} lượt {j}: `refers_to_position`={dat!r} phải là "
                    f"{{'turn': 1..{j - 1}, 'index': >=1}}"
                )
        if exp.get("refers_to_turn") is not None:
            k = exp["refers_to_turn"]
            if not isinstance(k, int) or not 1 <= k < j:
                loi.append(
                    f"{script['id']} lượt {j}: `refers_to_turn`={k!r} phải là số lượt TRƯỚC đó "
                    f"(1..{j - 1}) — tham chiếu về lượt chưa xảy ra thì không đo được gì"
                )
    return loi


def chay_kich_ban(script: dict, items: list[dict]) -> list[dict]:
    """Chạy hết một kịch bản, trả về một bản ghi cho mỗi lượt.

    Đường đi mỗi lượt đúng thứ tự dịch vụ thật dùng, và thứ tự này là phần dễ sai nhất:

        understand(câu)                  -> chỉ những gì lượt NÀY nói
        merge_into_request(., bộ nhớ)    -> cộng dị nguyên, ghi đè ràng buộc cứng theo nhóm
        respond(bản ĐÃ hợp nhất)         -> trả lời
        update_state(bộ nhớ, bản ĐÃ hợp nhất, món đã nêu, DẠNG đáp án)

    Ghi bộ nhớ từ bản **đã hợp nhất**, không phải bản gốc: bản gốc của lượt 2 không chứa dị nguyên
    khai ở lượt 1, nên ghi từ bản gốc là **mất dị nguyên ngay lượt sau** — đúng lỗi mà cả khâu bộ
    nhớ tồn tại để chống.
    """
    theo_id = _theo_id(items)
    state = S.SessionState()
    ghi: list[dict] = []

    for turn in script["turns"]:
        request = understand(turn["user"], items)
        merged = S.merge_into_request(request, state)
        reply = answer.respond(merged, items)
        state = S.update_state(state, merged, list(reply.items), reply.kind, reply.branch)
        ghi.append({
            "user": turn["user"],
            "expect": turn.get("expect", {}),
            "request": merged,
            "reply": reply,
            "state": state,
            "items": [theo_id[i] for i in reply.items if i in theo_id],
            # Cả thực đơn, để `must_name_item` tra tên theo mã món — tiêu chí khai mã, không khai
            # chuỗi, nên nó không trôi khi tên món đổi.
            "menu": items,
        })
    return ghi


def cham_luot(ban_ghi: dict, truoc: list[dict]) -> list[str]:
    """Trả về danh sách lý do ĐỎ. Rỗng nghĩa là lượt đạt.

    `truoc` là các bản ghi của những lượt TRƯỚC lượt này, dùng cho `refers_to_turn`.
    """
    exp, reply, state = ban_ghi["expect"], ban_ghi["reply"], ban_ghi["state"]
    do: list[str] = []

    # --- nhánh đã đi ---
    # Có vì tới trước bản này KHÔNG tiêu chí nào của tập phiên nói được "lượt này
    # phải đi qua nhánh nào". Hệ quả: nhánh truy hồi chạy 0/163 lượt mà không ca
    # nào đỏ — tập ca không hỏi tới nó, nên nó vắng mặt một cách hợp lệ.
    if exp.get("expect_branch_prefix"):
        can = exp["expect_branch_prefix"]
        if not (reply.branch or "").startswith(can):
            do.append(f"đi nhánh `{reply.branch}`, cần nhánh bắt đầu bằng `{can}`")

    # --- câu trả lời ---
    for tag in exp.get("forbid_tags_any", []):
        xau = [i["name"] for i in ban_ghi["items"] if tag in i["tags"]]
        if xau:
            do.append(f"AN TOÀN: câu trả lời có món mang `{tag}`: {xau}")

    if exp.get("min_items") is not None and len(reply.items) < exp["min_items"]:
        do.append(f"nêu {len(reply.items)} món, cần ít nhất {exp['min_items']}")

    # `max_items` — trần, đối xứng với `min_items`. Có vì nhóm `social_intent` cần khẳng định
    # KHÔNG có món nào: một lời chào kèm danh sách 6 món là đúng lỗi đang sửa, và `min_items`
    # không diễn đạt được điều đó.
    if exp.get("max_items") is not None and len(reply.items) > exp["max_items"]:
        do.append(f"nêu {len(reply.items)} món, không được quá {exp['max_items']}")

    if exp.get("expect_kind") and reply.kind != exp["expect_kind"]:
        do.append(f"dạng đáp án `{reply.kind}`, cần `{exp['expect_kind']}`")

    # `must_name_item`: câu trả lời phải NHẮC TÊN đúng món, tên lấy từ thực đơn theo mã món.
    #
    # Tiêu chí này khai mã món chứ không khai chuỗi, nên nó không thể trùng với chính lời giải
    # thích của nó — lớp lỗi "phép kiểm chuỗi khớp đúng cách nó tự diễn đạt" đã xảy ra bốn lần
    # trong dự án này.
    for mid in exp.get("must_name_item", []):
        mon = _theo_id(ban_ghi["menu"])[mid] if "menu" in ban_ghi else None
        ten = mon["name"] if mon else mid
        if ten not in reply.text:
            do.append(f"không nhắc {ten!r} — câu trả lời sai món")

    # `must_say_any`: câu trả lời phải chứa MỘT trong các cụm khách cần đọc thấy.
    #
    # Dùng cho đúng một việc: câu cực trị phải nói ra PHẠM VI của nó. "Món đắt nhất là Cháo lòng
    # Sài Gòn, giá 45.000đ" là khẳng định tuyệt đối sai dù tên món và giá đều có thật — nó chỉ
    # đúng trong ngân sách đang có hiệu lực. Không cụm nào trong câu trả lời nói ra điều đó thì
    # khách đọc được một điều sai, và không tiêu chí nào khác của bộ này bắt được.
    cum = exp.get("must_say_any")
    if cum and not any(c.lower() in reply.text.lower() for c in cum):
        do.append(f"không có cụm nào trong {cum} — câu trả lời không nói ra phạm vi của nó")

    # `must_say_all`: MỌI cụm phải có mặt. Dùng khi một lượt cần chốt hai điều cùng lúc.
    #
    # Có mặt vì `must_name_item` không dùng được ở chỗ có HÒA: 5 món cùng giá 95.000đ, nên chốt
    # "phải nhắc Bún đậu mắm tôm" qua được chỉ nhờ thứ tự phá hòa của bảng xếp hạng — tiêu chí đó
    # có thể đỏ khi hệ thống hoàn toàn đúng. Chốt GIÁ thì không phụ thuộc thứ tự, mà vẫn phân biệt
    # được đắt nhất với rẻ nhất (95.000đ so với 45.000đ).
    for c in exp.get("must_say_all", []):
        if c.lower() not in reply.text.lower():
            do.append(f"thiếu cụm {c!r} trong câu trả lời")

    # `must_not_say_any`: cụm KHÔNG được có mặt.
    #
    # Chiều phủ định là chỗ tiêu chí dễ thành mã chết nhất. Kịch bản `extreme-scope-02` ghi trong
    # `why` rằng nó chặn bản "luôn thêm 'trong phạm vi bạn nêu'", nhưng bản đầu KHÔNG có tiêu chí
    # nào kiểm sự vắng mặt — lời giải thích nói một việc, bộ chạy làm việc khác, và ca vẫn xanh với
    # cả hai bản. Đó là lỗi tệ hơn thiếu ca: nó làm người đọc tin một chiều đã được đo.
    for c in exp.get("must_not_say_any", []):
        if c.lower() in reply.text.lower():
            do.append(f"câu trả lời có cụm {c!r} mà lượt này KHÔNG được có")

    if exp.get("refers_to_turn") is not None:
        k = exp["refers_to_turn"]
        ten_truoc = [i["name"] for i in truoc[k - 1]["items"]]
        # So bằng TÊN món trong văn bản trả lời, không bằng `reply.items`: một câu trả lời dạng
        # `fact` nêu giá một món có thể không đưa món đó vào `items`, nhưng nó vẫn phải NHẮC tên.
        if not any(ten in reply.text for ten in ten_truoc):
            do.append(
                f"không nhắc món nào của lượt {k} ({ten_truoc[:3]}) — chưa hiểu tham chiếu ngược"
            )

    # `refers_to_position` là bản CHẶT của `refers_to_turn`, và nó tồn tại vì bản lỏng cho ca ĐẠT
    # SAI LÝ DO lần thứ ba trong dự án này.
    #
    # Cụ thể: câu "món thứ hai có hải sản không?" mà hệ thống KHÔNG hiểu sẽ rơi vào nhánh lọc và
    # liệt kê lại danh sách cũ. Danh sách đó CHỨA tên món của lượt 1, nên `refers_to_turn` thỏa —
    # dù hệ thống chẳng hiểu "thứ hai" là gì. Tiêu chí lỏng biến một lỗi thành một ca xanh.
    #
    # Bản chặt đòi hai điều cùng lúc: nhắc ĐÚNG món ở vị trí đó, và KHÔNG nhắc món nào khác của
    # danh sách. Điều thứ hai là điều then chốt — liệt kê lại cả danh sách thì nó vi phạm ngay.
    if exp.get("refers_to_position") is not None:
        dat = exp["refers_to_position"]
        k, vi_tri = dat["turn"], dat["index"]
        ds = truoc[k - 1]["items"]
        if len(ds) < vi_tri:
            do.append(
                f"lượt {k} chỉ nêu {len(ds)} món nên vị trí {vi_tri} không tồn tại — "
                "ca viết sai, không phải hệ thống sai"
            )
        else:
            can = ds[vi_tri - 1]["name"]
            khac = [i["name"] for i in ds if i["name"] != can and i["name"] in reply.text]
            if can not in reply.text:
                do.append(
                    f"không nhắc món ở vị trí {vi_tri} của lượt {k} ({can!r}) — "
                    "chưa hiểu tham chiếu theo vị trí"
                )
            if khac:
                do.append(
                    f"nhắc thêm {len(khac)} món KHÁC của lượt {k} ({khac[:3]}) — "
                    "liệt kê lại danh sách không phải trả lời về MỘT món"
                )

    # `must_not_repeat_turn` + `must_match_turn_constraint` là cặp tiêu chí cho câu "còn món nào
    # GIỐNG VẬY không?" — và cặp này tồn tại vì `refers_to_turn` đã cho một ca ĐẠT SAI LÝ DO.
    #
    # Ca đó qua vì hệ thống **liệt kê lại đúng danh sách cũ**: nhắc tên món của lượt 1 nên tiêu
    # chí "phải nhắc tên món lượt trước" thỏa, dù nó chẳng hiểu chữ "giống vậy" nào. Với câu hỏi
    # kiểu này, câu trả lời ĐÚNG phải nêu món **khác** — nên đòi nhắc tên cũ là đòi ngược.
    # Đo đúng cần hai chiều cùng lúc: MỚI (không lặp) và CÙNG KIỂU (chung nhãn).
    if exp.get("must_not_repeat_turn") is not None:
        k = exp["must_not_repeat_turn"]
        cu = {i["id"] for i in truoc[k - 1]["items"]}
        moi = [i for i in ban_ghi["items"] if i["id"] not in cu]
        # Chỉ chấm đỏ khi câu trả lời CÓ liệt kê mà không món nào mới.
        #
        # Bản đầu chấm đỏ cả khi câu trả lời nêu 0 món, và nó lẫn hai kết cục hoàn toàn khác nhau:
        # "lặp lại danh sách cũ" với "đã hết món, và nói rõ là hết". Kết cục thứ hai là câu trả lời
        # ĐÚNG cho "còn gì nữa không" sau khi đã duyệt hết — chấm nó đỏ là ép hệ thống bịa thêm món.
        #
        # Lượt nêu 0 món vẫn phải chứng minh nó nói rõ, nhưng bằng tiêu chí KHÁC (`expect_kind`,
        # `must_say_any`) — một tiêu chí đo một việc.
        if ban_ghi["items"] and not moi:
            do.append(
                f"nêu lại đúng {len(cu)} món của lượt {k}, không món nào mới — "
                "liệt kê lại danh sách cũ không phải trả lời 'còn món nào giống vậy'"
            )

    # "chung nhãn với lượt trước" là tiêu chí QUÁ LỎNG và tôi đã thử nó: `season:all_year` gắn cho
    # 69/91 món, nên hai món bất kỳ gần như luôn chung một nhãn, và ca vẫn ĐẠT SAI LÝ DO. Tiêu chí
    # chặt là: món nêu ra phải thỏa đúng RÀNG BUỘC mà lượt được trỏ đã hiểu — danh mục và nhãn
    # bắt buộc của lượt đó. Đó mới là nghĩa của "giống vậy".
    if exp.get("must_match_turn_constraint") is not None:
        k = exp["must_match_turn_constraint"]
        rb = truoc[k - 1]["request"]
        buoc = list(rb.require_tags)
        if not buoc and not rb.categories:
            do.append(
                f"lượt {k} không có ràng buộc nào nên tiêu chí này không đo được gì — "
                "chọn lượt trước có ràng buộc rõ"
            )
        else:
            xau = [
                i["name"] for i in ban_ghi["items"]
                if (rb.categories and i["categoryId"] not in rb.categories)
                or any(t not in i["tags"] for t in buoc)
            ]
            if xau:
                do.append(
                    f"nêu món KHÔNG thỏa ràng buộc của lượt {k} "
                    f"(danh mục={rb.categories or '-'}, nhãn={buoc or '-'}): {xau[:4]} — "
                    "'giống vậy' chưa được hiểu, hệ thống chỉ liệt kê lại thực đơn"
                )

    # --- bộ nhớ ---
    for tag in exp.get("memory_must_have_avoid", []):
        if tag not in state.avoid_tags:
            do.append(
                f"AN TOÀN: bộ nhớ MẤT `{tag}` (còn {state.avoid_tags}) — lượt sau không còn "
                "được bảo vệ, và lượt sau đó nhìn vô hại nên không ai nghi"
            )
    # Chiều NGƯỢC của `memory_must_have_avoid`, và nó cần thiết vì "an toàn quá mức" cũng là lỗi:
    # ghi một câu HỎI thành lời KHAI làm 26/91 món bị ẩn suốt phiên cho một khách chỉ tò mò, và mọi
    # câu sau đó khẳng định "thành phần bạn cần tránh" — điều khách chưa nói. Không có tiêu chí này
    # thì một hệ thống ẩn quá nhiều vẫn xanh mọi ca.
    for tag in exp.get("memory_must_not_have_avoid", []):
        if tag in state.avoid_tags:
            do.append(
                f"bộ nhớ ĐÃ GHI `{tag}` dù khách chỉ HỎI, không KHAI — từ lượt sau khách mất "
                "lựa chọn và câu trả lời khẳng định một điều họ chưa nói"
            )
    for tag in exp.get("memory_must_have_require", []):
        if tag not in state.hard_tags:
            do.append(f"bộ nhớ thiếu ràng buộc cứng `{tag}` (còn {state.hard_tags})")
    for tag in exp.get("memory_must_not_have_require", []):
        if tag in state.hard_tags:
            do.append(
                f"bộ nhớ CÒN GIỮ `{tag}` sau khi khách đổi ý — ghi đè phải theo NHÓM, "
                "giữ cả hai giá trị thì phép lọc AND cho kết quả RỖNG"
            )
    # `in exp`, KHÔNG phải `.get(...) is not None`: bản trước bỏ qua im lặng tiêu chí
    # `memory_budget_max: null`, tức "bộ nhớ phải KHÔNG có ngân sách" — đúng chiều cần đo cho lỗi
    # giá khách khẳng định bị lưu thành ngân sách. Một tiêu chí viết đúng ý mà bộ chạy lặng lẽ bỏ
    # qua là ca luôn xanh, và đây là lần thứ ba lớp lỗi này xuất hiện trong dự án.
    if "memory_budget_max" in exp and state.budget_max != exp["memory_budget_max"]:
        do.append(f"ngân sách trong bộ nhớ {state.budget_max}, cần {exp['memory_budget_max']}")
    if exp.get("memory_wants") and state.wants != exp["memory_wants"]:
        do.append(f"`wants` trong bộ nhớ {state.wants!r}, cần {exp['memory_wants']!r}")
    if exp.get("memory_remembers_suggested"):
        truoc_ids = {i for r in truoc for i in r["reply"].items}
        if not truoc_ids:
            do.append("lượt trước không nêu món nào nên tiêu chí này không đo được gì")
        elif not truoc_ids & set(state.suggested_item_ids):
            do.append(
                f"bộ nhớ không ghi món đã gợi ý (có {state.suggested_item_ids[:3]}, "
                f"lượt trước nêu {sorted(truoc_ids)[:3]}) — lượt sau không biết bỏ gì"
            )
    return do


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chi-tiet", action="store_true", help="In từng lượt đỏ.")
    args = parser.parse_args(argv)

    data = json.loads(SCRIPTS_PATH.read_text(encoding="utf-8-sig"))
    scripts = data["scripts"]
    items = load_menu()

    # Kiểm tiêu chí TRƯỚC khi chạy. Tiêu chí sai thì con số vô nghĩa, nên đây là lỗi chặn.
    loi_tieu_chi = [l for s in scripts for l in _kiem_tieu_chi(s)]
    if loi_tieu_chi:
        print(f"TIÊU CHÍ VIẾT SAI ({len(loi_tieu_chi)}) — không chạy, vì con số sẽ vô nghĩa:")
        for l in loi_tieu_chi:
            print(f"  - {l}")
        return 1

    tong_luot = do_luot = khoang_cach = an_toan = 0
    theo_nhom: dict[str, list[int]] = collections.defaultdict(lambda: [0, 0, 0])
    kich_ban_do: dict[str, list[str]] = {}
    chi_tiet: list[str] = []

    for script in scripts:
        nhom = script["group"]
        ghi = chay_kich_ban(script, items)
        do_cua_kb: list[str] = []
        for j, ban_ghi in enumerate(ghi):
            tong_luot += 1
            theo_nhom[nhom][0] += 1
            do = cham_luot(ban_ghi, ghi[:j])
            asp = bool(ban_ghi["expect"].get("aspirational"))
            if not do:
                theo_nhom[nhom][1] += 1
                continue
            an_toan += sum(1 for d in do if d.startswith("AN TOÀN"))
            if asp:
                khoang_cach += 1
                theo_nhom[nhom][2] += 1
            else:
                do_luot += 1
                do_cua_kb.extend(do)
            nhan = "KHOẢNG CÁCH" if asp else "ĐỎ"
            chi_tiet.append(
                f"  [{nhan}] {script['id']} lượt {j + 1}: {ban_ghi['user']!r}\n"
                + "".join(f"        - {d}\n" for d in do)
            )
        if do_cua_kb:
            kich_ban_do[script["id"]] = do_cua_kb

    print("BỘ NHỚ PHIÊN — kịch bản đa lượt, thứ 119 ca một lượt không đo được\n")
    qua = tong_luot - do_luot - khoang_cach
    print(f"  lượt         : {tong_luot}")
    print(f"  đạt          : {qua}/{tong_luot}  ({100 * qua / tong_luot:.1f}%)")
    print(f"  đỏ           : {do_luot}")
    print(f"  khoảng cách  : {khoang_cach}  (aspirational — hệ thống chưa làm được, không chặn)")
    print(f"  lỗi AN TOÀN  : {an_toan}")

    print(f"\n  {'nhóm':22}{'lượt':>6}{'đạt':>6}{'kc':>5}   chốt an toàn")
    print("  " + "-" * 60)
    for nhom in sorted(theo_nhom):
        t, d, k = theo_nhom[nhom]
        chot = "CÓ — đỏ là CHẶN" if nhom in GATE_GROUPS else ""
        print(f"  {nhom:22}{t:>6}{d:>6}{k:>5}   {chot}")

    if args.chi_tiet and chi_tiet:
        print(f"\nchi tiết ({len(chi_tiet)} lượt):")
        for c in chi_tiet:
            print(c, end="")

    # Mã trả về: chặn khi có lỗi an toàn, hoặc khi nhóm chốt đỏ.
    chot_do = [
        sid for sid, _ in kich_ban_do.items()
        if next(s["group"] for s in scripts if s["id"] == sid) in GATE_GROUPS
    ]
    if an_toan:
        print(f"\nCHẶN: {an_toan} lỗi an toàn. Một lượt mời món gây dị ứng là chặn phát hành.")
        return 1
    if chot_do:
        print(f"\nCHẶN: nhóm chốt an toàn đỏ ở {chot_do}.")
        return 1
    if do_luot:
        print(f"\n{do_luot} lượt đỏ (không thuộc nhóm chốt) — chạy lại với --chi-tiet.")
        return 1
    print(f"\nKhông lượt nào đỏ. Còn {khoang_cach} lượt khoảng cách — xem mục tham chiếu ngược.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
