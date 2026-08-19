# -*- coding: utf-8 -*-
"""Sinh kịch bản hội thoại ĐA LƯỢT — thứ 119 ca một lượt không đo được.

Vì sao cần tập riêng
--------------------
119 ca hiện có đều **một lượt**. Chúng đo được việc hệ thống hiểu một câu, nhưng không đo được
điều quan trọng nhất của một cuộc hội thoại thật:

    khách khai dị ứng ở lượt 1, rồi hỏi tiếp ở lượt 5 MÀ KHÔNG NHẮC LẠI

Nếu bộ nhớ quên, hệ thống mời đúng món khách không ăn được — và câu ở lượt 5 nhìn hoàn toàn vô
hại nên không ai nghi. Đó là lỗi an toàn khó thấy nhất hệ thống này có thể mắc, và **không ca
một lượt nào bắt được nó**.

Tôi đã chạy tay 6 lượt qua backend thật và thấy 0 món dị nguyên lọt. Nhưng chạy tay một lần
không phải phép đo: nó không lặp lại được, không vào CI, và không ai biết nó còn đúng sau lần
sửa tiếp theo. **Chốt an toàn không có tập ca là chốt bằng lời.**

Năm nhóm, và nhóm đầu là CHỐT
-----------------------------
    allergy_persists      dị nguyên khai một lần phải giữ suốt phiên          CHỐT AN TOÀN
    constraint_overrides  "rẻ hơn nữa" phải THAY ngân sách cũ, không cộng dồn
    no_repeat             "món khác đi" không được gợi lại món đã nêu
    context_reference     "món đầu tiên giá bao nhiêu" — tham chiếu ngược
    chained_reference     HAI lượt tham chiếu liên tiếp — nhóm này sinh ra từ một lỗi tìm được khi
                          CHẠY THẬT qua backend, không tìm được bằng bốn nhóm trên
    question_not_declaration  câu HỎI "món này có hải sản không?" KHÔNG được thành lời KHAI dị ứng
                          — cũng sinh ra từ một lỗi tìm được khi chạy thật

Mỗi lượt kiểm HAI thứ, và thứ hai mới là điều đáng đo
-----------------------------------------------------
    câu trả lời   không món nào mang nhãn cần tránh
    BỘ NHỚ        nhãn cần tránh CÒN trong `merged.avoid_tags`

Chỉ kiểm câu trả lời thì một hệ thống **quên dị ứng nhưng tình cờ không gợi món hải sản** cũng
qua. Kiểm cả bộ nhớ thì không.

    python ai/scripts/build_session_scripts.py            # sinh lại
    python ai/scripts/build_session_scripts.py --check     # kiểm, không ghi
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "ai" / "evaluation" / "session_scripts.json"
MENU_PATH = REPO_ROOT / "data" / "menu-dataset.json"

# Câu KHÔNG nhắc dị ứng, dùng làm lượt tiếp theo. Chúng phải nhìn hoàn toàn vô hại — đó là cả
# điểm của phép đo: nếu câu nào cũng nhắc dị ứng thì bộ nhớ không cần tồn tại.
CAU_VO_HAI = [
    "Món nào rẻ hơn?",
    "Cho mình món không cay",
    "Thêm món tráng miệng đi",
    "Nhóm mình 4 người thì gọi gì",
    "Có món nào đặc trưng nhà hàng không?",
    "Món nào bán chạy nhất?",
    "Cho mình xem thêm vài món",
]

# Cách khai dị ứng, mỗi cách một nhãn. Trộn cả cách nói chuẩn và cách nói dân dã, vì bộ nhớ phải
# giữ được bất kể khách khai bằng cách nào.
KHAI_DI_UNG = [
    ("Mình dị ứng hải sản, gợi ý món ăn giúp mình", "allergen:seafood", "cách nói chuẩn"),
    ("Mình không ăn được đồ tanh", "allergen:seafood", "cách nói dân dã"),
    ("Bé nhà mình uống sữa là bị đau bụng", "allergen:dairy", "triệu chứng"),
    ("Ăn tôm là mình bị nổi mề đay", "allergen:seafood", "tên món cụ thể + triệu chứng"),
    ("Tôi dị ứng đậu phộng, món nào tránh được?", "allergen:peanut", "cách nói chuẩn"),
]


def build() -> dict:
    scripts: list[dict] = []
    # Thực đơn, để nhóm `extreme_scope` TÍNH mã món trong tiêu chí thay vì viết tay: giá món đổi
    # làm món đắt nhất thành món khác thì kịch bản đổi theo, không trôi thành tiêu chí sai.
    items = json.loads(MENU_PATH.read_text(encoding="utf-8-sig"))["items"]

    # --- NHÓM 1: dị nguyên phải giữ suốt phiên (CHỐT AN TOÀN) -------------------------
    for i, (cau_khai, nhan, loai) in enumerate(KHAI_DI_UNG, 1):
        turns = [{
            "user": cau_khai,
            "expect": {
                "forbid_tags_any": [nhan],
                "memory_must_have_avoid": [nhan],
                "why": f"Lượt khai dị ứng ({loai}). Phải vào bộ nhớ ngay lượt này.",
            },
        }]
        # Bốn lượt sau KHÔNG nhắc dị ứng. Xoay vòng câu vô hại để năm kịch bản không giống nhau.
        for j in range(4):
            cau = CAU_VO_HAI[(i + j) % len(CAU_VO_HAI)]
            turns.append({
                "user": cau,
                "expect": {
                    "forbid_tags_any": [nhan],
                    "memory_must_have_avoid": [nhan],
                    "why": (
                        f"Lượt {j + 2}: câu KHÔNG nhắc dị ứng. Nếu bộ nhớ quên thì hệ thống mời "
                        f"đúng món khách không ăn được, và câu này nhìn hoàn toàn vô hại nên "
                        f"không ai nghi. Kiểm CẢ bộ nhớ, không chỉ câu trả lời — hệ thống quên "
                        f"mà tình cờ không gợi món {nhan} vẫn phải bị bắt."
                    ),
                },
            })
        scripts.append({
            "id": f"allergy-persists-{i:02d}",
            "group": "allergy_persists",
            "why": f"Dị nguyên khai bằng {loai}, giữ qua 5 lượt. Đây là CHỐT AN TOÀN.",
            "turns": turns,
        })

    # --- NHÓM 2: ràng buộc cứng GHI ĐÈ cùng nhóm --------------------------------------
    # Mỗi mục có tiêu chí cho CẢ HAI lượt, không chỉ lượt sau.
    #
    # Bản đầu của tôi để lượt 1 chỉ có `why` — tức lượt đó **không đo gì**, và `run_session_eval.py`
    # đã chặn đúng 6 lượt như vậy. Nó quan trọng hơn là nó trông: nếu lượt 1 không kiểm rằng ràng
    # buộc ĐÃ VÀO bộ nhớ, thì lượt 2 xanh không phân biệt được hai trường hợp trái ngược nhau:
    #
    #   ghi đè ĐÚNG      lượt 1 ghi `spice:none`, lượt 2 thay bằng `spice:hot`
    #   KHÔNG NHỚ GÌ     lượt 1 chẳng ghi gì cả, lượt 2 chỉ đọc câu của chính nó
    #
    # Trường hợp thứ hai là bộ nhớ hỏng hoàn toàn, mà vẫn qua được mọi tiêu chí "phải có nhãn mới,
    # không được còn nhãn cũ". Tiêu chí lượt 1 chính là thứ tách hai trường hợp đó ra.
    GHI_DE = [
        ("Cho mình món dưới 200 nghìn", {"memory_budget_max": 200_000},
         "Rẻ hơn 100 nghìn đi", {"memory_budget_max": 100_000},
         "Ngân sách mới phải THAY ngân sách cũ. Cộng dồn thì cái nào thắng là tùy thứ tự áp."),
        ("Cho mình món không cay", {"memory_must_have_require": ["spice:none"]},
         "Thôi cho mình món cay đậm",
         {"memory_must_have_require": ["spice:hot"], "memory_must_not_have_require": ["spice:none"]},
         "Ghi đè theo NHÓM chứ không theo nhãn. Giữ cả hai mức cay thì phép lọc AND cho kết quả "
         "RỖNG và khách nhận 'không có món nào' cho một yêu cầu hoàn toàn hợp lệ."),
        ("Nhóm mình 2 người", {"memory_must_have_require": ["party:two_three"]},
         "À thành 5 người rồi",
         {"memory_must_have_require": ["party:three_five"],
          "memory_must_not_have_require": ["party:two_three"]},
         "Cùng nhóm `party` — lượt mới đẩy giá trị cũ ra."),
        ("Cho mình món ăn", {"memory_wants": "food"},
         "Cho mình đồ uống thôi", {"memory_wants": "drink"},
         "`wants` cũng là ràng buộc cứng dù không mang dạng nhãn."),
        ("Mình dị ứng hải sản", {"memory_must_have_avoid": ["allergen:seafood"]},
         "Mình cũng không ăn được sữa",
         {"memory_must_have_avoid": ["allergen:seafood", "allergen:dairy"]},
         "Chiều PHÂN BIỆT quan trọng nhất: dị nguyên CỘNG DỒN, không ghi đè. Nếu nó ghi đè như "
         "ràng buộc cứng thì khai sữa ở lượt 2 xóa hải sản của lượt 1 — mất bảo vệ."),
        ("Cho mình món chay dưới 100 nghìn", {"memory_budget_max": 100_000},
         "Cho mình món dưới 50 nghìn", {"memory_budget_max": 50_000},
         "Ngân sách đổi nhưng ràng buộc chay KHÔNG bị đổi — khác nhóm thì không ghi đè nhau."),
    ]
    for i, (cau1, mong1, cau2, mong2, why) in enumerate(GHI_DE, 1):
        scripts.append({
            "id": f"constraint-overrides-{i:02d}",
            "group": "constraint_overrides",
            "why": why,
            "turns": [
                {"user": cau1, "expect": {**mong1, "why":
                    "Lượt đặt ràng buộc ban đầu — và phải kiểm rằng nó ĐÃ VÀO bộ nhớ. Không kiểm "
                    "thì lượt 2 xanh cũng không phân biệt được 'ghi đè đúng' với 'không nhớ gì cả'."}},
                {"user": cau2, "expect": {**mong2, "why": why}},
            ],
        })

    # --- NHÓM 3: không gợi lại món đã nêu ---------------------------------------------
    KHONG_LAP = [
        "Cho mình món chay", "Món nào không cay", "Gợi ý món ăn tối",
        "Cho mình món dưới 100 nghìn", "Món nào đặc trưng nhà hàng",
    ]
    for i, cau in enumerate(KHONG_LAP, 1):
        scripts.append({
            "id": f"no-repeat-{i:02d}",
            "group": "no_repeat",
            "why": ("Khách nói 'món khác đi' thì hệ thống không được gợi lại món vừa nêu. Backend "
                    "đã có `GetExcludedMenuItemIds`, nên phần này là hợp nhất bộ nhớ."),
            "turns": [
                {"user": cau, "expect": {"min_items": 2, "why": "Lượt gợi ý đầu."}},
                {"user": "Cho mình món khác đi",
                 "expect": {"memory_remembers_suggested": True,
                            "why": "Bộ nhớ phải GHI món đã gợi ý. Không ghi thì lượt sau không "
                                   "biết bỏ gì, và khách nhận đúng danh sách cũ."}},
            ],
        })

    # --- NHÓM 4: tham chiếu ngược -----------------------------------------------------
    # Đây là nhóm hệ thống hiện CHƯA làm được, và tập ca nói ra điều đó thay vì che.
    # LỊCH SỬ của nhóm này, giữ lại vì nó là bài học chính của cả tập ca:
    #
    # 1. Ban đầu mỗi lượt chỉ có `{"aspirational": true, "why": ...}` — tức KHÔNG ĐO GÌ. Không có
    #    tiêu chí thì không có gì để đỏ, nên "9 ca aspirational" là 9 ca luôn qua dưới danh nghĩa
    #    được phép đỏ. Tệ hơn không có ca: bảng kết quả trông như đã bao phủ tham chiếu ngược.
    #    `run_session_eval.py::_kiem_tieu_chi` giờ CHẶN đúng hình dạng đó.
    # 2. Thêm tiêu chí đo được -> 9/9 lượt đỏ, và đó là con số thật của khoảng cách.
    # 3. Một ca ĐẠT SAI LÝ DO: "còn món nào giống vậy" qua được `refers_to_turn` vì hệ thống in lại
    #    đúng danh sách cũ. Tiêu chí bị đổi sang cặp "không lặp + thỏa ràng buộc lượt trỏ".
    # 4. Khả năng được DỰNG (`SessionState.last_listed_ids` + cụm chỉ vị trí) -> 9/9 đạt, và cờ
    #    `aspirational` bị BỎ. Giữ nó lại thì lần sau khả năng này hỏng, tập ca báo "khoảng cách"
    #    chứ không báo "tụt".
    #
    # Nên mỗi lượt tham chiếu có tiêu chí ĐO ĐƯỢC, ứng đúng điều khách hỏi:
    #
    #   refers_to_turn      câu trả lời phải nhắc tên một món đã nêu ở lượt đó (1-based). Đây là
    #                       phần cốt lõi của tham chiếu ngược: không nhắc lại món nào thì hệ thống
    #                       chưa hiểu "món đầu tiên" trỏ vào đâu.
    #   expect_kind         dạng đáp án đúng cho câu đó — hỏi giá thì phải trả `fact` chứ không
    #                       phải liệt kê lại một danh sách mới.
    #
    # Nhưng có HAI KIỂU tham chiếu ngược, và chúng cần tiêu chí NGƯỢC NHAU:
    #
    #   trỏ vào một món cũ   "món đầu tiên giá bao nhiêu?" -> phải NHẮC LẠI tên món của lượt 1.
    #   xin thêm món giống   "còn món nào giống vậy không?" -> phải nêu món KHÁC (không lặp) mà
    #                        vẫn thỏa RÀNG BUỘC của lượt cũ. "Chung một nhãn bất kỳ" thì quá lỏng:
    #                        `season:all_year` gắn cho 69/91 món nên hai món bất kỳ cũng chung nhãn.
    #
    # Bản đầu tôi dùng chung `refers_to_turn` cho cả hai, và ca "giống vậy" **đạt SAI LÝ DO**: hệ
    # thống liệt kê lại đúng danh sách cũ nên nó có nhắc tên món lượt trước, dù không hiểu chữ
    # "giống vậy" nào. Với kiểu thứ hai, đòi nhắc lại tên cũ là đòi NGƯỢC điều đúng — và một ca
    # đạt sai lý do tệ hơn ca đỏ, vì nó báo là đã bao phủ.
    THAM_CHIEU = [
        ("Cho mình món chay", "Món đầu tiên giá bao nhiêu?", "fact", "tro_vao_mon_cu"),
        ("Món nào không cay", "Cái đó có cay không?", "fact", "tro_vao_mon_cu"),
        ("Gợi ý món ăn tối", "Món thứ hai có hải sản không?", "fact", "tro_vao_mon_cu"),
        ("Cho mình món dưới 100 nghìn", "Món rẻ nhất trong số đó là gì?", "fact", "tro_vao_mon_cu"),
        ("Món nào đặc trưng nhà hàng", "Món vừa rồi làm từ gì?", "fact", "tro_vao_mon_cu"),
        # `fact` — và tiêu chí này đã ĐỔI HAI LẦN, nên cả hai lần được ghi lại.
        #
        # Lần 1: đổi từ `fact` sang `no_data`, với lý do "thực đơn không có dữ liệu khẩu phần" —
        # dựa trên việc nhóm `serving` chỉ có `takeaway`/`hot`/`preorder`.
        #
        # Lần 2: đổi NGƯỢC LẠI về `fact`, vì lý do của lần 1 SAI. Nó bỏ sót nhóm `party`:
        # `party:solo` = "Cá nhân", `party:two_three` = "2-3 người", `party:three_five` =
        # "3-5 người" — và nhóm đó phủ **91/91 món**, chính dự án này dùng nó làm ràng buộc cứng vì
        # độ phủ đó.
        #
        # Bài học đắt hơn cả hai lần đổi: một tiêu chí bị sửa theo một KẾT LUẬN SAI về dữ liệu thì
        # nó khóa cái sai đó lại. Ca trở thành bằng chứng rằng hệ thống đúng khi nói "không biết",
        # trong khi câu trả lời nằm trong repo. Xem một nhóm nhãn rồi kết luận về cả thực đơn là
        # lỗi đọc dữ liệu, và tiêu chí đánh giá là chỗ nó sống lâu nhất.
        ("Cho mình xem món lẩu", "Món đó cho mấy người ăn?", "fact", "tro_vao_mon_cu"),
        ("Gợi ý món cho 4 người", "Cái thứ ba bao nhiêu tiền?", "fact", "tro_vao_mon_cu"),
        ("Cho mình món chay", "Còn món nào giống vậy không?", "list", "xin_them_mon_giong"),
        ("Món nào bán chạy nhất", "Món đó có đậu phộng không?", "fact", "tro_vao_mon_cu"),
    ]
    for i, (cau1, cau2, dang, kieu) in enumerate(THAM_CHIEU, 1):
        if kieu == "tro_vao_mon_cu":
            tieu_chi = {"refers_to_turn": 1}
            noi_them = "câu trả lời phải nhắc một món của lượt 1"
        else:
            tieu_chi = {"must_not_repeat_turn": 1, "must_match_turn_constraint": 1}
            noi_them = ("câu trả lời phải nêu món KHÁC lượt 1 mà vẫn thỏa ràng buộc của lượt 1 "
                        "— đòi nhắc lại tên món cũ ở đây là đòi ngược, vì trả lời đúng thì nêu "
                        "món mới")
        scripts.append({
            "id": f"context-reference-{i:02d}",
            "group": "context_reference",
            "why": ("Tham chiếu ngược ('món đầu tiên', 'cái đó'). Hệ thống hiện CHƯA làm được — "
                    "nhóm này đo khoảng cách còn lại, không phải đo thứ đã xong. Ca ở đây được "
                    "phép đỏ, và số đỏ là con số đáng báo cáo."),
            "turns": [
                {"user": cau1, "expect": {"min_items": 1, "why": "Lượt nêu danh sách."}},
                {"user": cau2,
                 "expect": {**tieu_chi,
                            "expect_kind": dang,
                            "why": "Lượt tham chiếu ngược. Nhóm này TỪNG được đánh "
                                   "`aspirational: true` (được phép đỏ) vì hệ thống chưa lưu dãy "
                                   "có thứ tự các món đã nêu — 9/9 lượt đỏ. Cờ đó ĐÃ BỎ sau khi "
                                   "khả năng được dựng và cả 9 lượt đạt. "
                                   "Bỏ cờ là bắt buộc, không phải dọn dẹp: giữ 'được phép đỏ' cho "
                                   "một khả năng ĐÃ CHẠY nghĩa là lần sau nó hỏng thì không ai "
                                   "biết — tập ca sẽ báo 'khoảng cách' thay vì báo 'tụt'. "
                                   f"Tiêu chí: {noi_them}, và dạng đáp án là `{dang}`."}},
            ],
        })

    # --- NHÓM 5: HAI lượt tham chiếu liên tiếp -----------------------------------------
    #
    # Nhóm này tồn tại vì một lỗi mà 25 kịch bản trước KHÔNG bắt được, và chỉ hiện ra khi chạy qua
    # backend thật. Mọi kịch bản `context_reference` chỉ có MỘT lượt tham chiếu, nên chuỗi dưới đây
    # chưa từng được chạy:
    #
    #   lượt 1  "cho mình món chay"             -> danh sách 6 món
    #   lượt 2  "món đầu tiên giá bao nhiêu?"   -> fact về 1 món
    #   lượt 3  "món thứ hai có hải sản không?" -> "thứ hai" trỏ vào đâu?
    #
    # Bản trước thay `last_listed_ids` mỗi khi lượt có nêu món, kể cả câu `fact` về MỘT món. Nên
    # sau lượt 2 dãy còn đúng 1 món, và lượt 3 không trỏ được — dù khách vẫn đang nói về danh sách
    # của lượt 1.
    #
    # Bài học ghi lại: tập ca kiểm điều người viết NGHĨ RA để kiểm. Một cuộc hội thoại thật có
    # những chuỗi không ai nghĩ tới, nên "chạy thật" không thay được bằng test — và ngược lại, mỗi
    # lỗi tìm được khi chạy thật phải trở thành một ca, nếu không nó sẽ quay lại.
    #
    # Tiêu chí dùng `refers_to_position` (bản CHẶT) chứ không dùng `refers_to_turn` (bản lỏng). Đã
    # đo: với bản lỏng, 2 trong 3 kịch bản dưới đây ĐẠT dù bản sửa bị tắt — vì hệ thống không hiểu
    # thì nó liệt kê lại danh sách cũ, và danh sách đó CHỨA tên món của lượt 1 nên tiêu chí "phải
    # nhắc món của lượt 1" thỏa. Bản chặt đòi nhắc ĐÚNG món ở vị trí đó VÀ không nhắc món nào khác.
    LIEN_TIEP = [
        ("Cho mình món chay", "Món đầu tiên giá bao nhiêu?",
         "Món thứ hai có hải sản không?", 2),
        ("Món nào không cay", "Món đầu tiên giá bao nhiêu?",
         "Món thứ ba giá bao nhiêu?", 3),
        ("Cho mình xem món lẩu", "Cái đó bao nhiêu tiền?",
         "Món thứ hai giá bao nhiêu?", 2),
    ]
    for i, (cau1, cau2, cau3, vi_tri) in enumerate(LIEN_TIEP, 1):
        scripts.append({
            "id": f"chained-reference-{i:02d}",
            "group": "chained_reference",
            "why": ("HAI lượt tham chiếu liên tiếp. Câu `fact` về MỘT món không được phá dãy món "
                    "mà khách còn đang trỏ vào. Lỗi này chỉ hiện khi chạy qua backend thật, không "
                    "hiện trong 25 kịch bản trước — vì mọi kịch bản trước chỉ có MỘT lượt tham "
                    "chiếu."),
            "turns": [
                {"user": cau1, "expect": {"min_items": 3, "why": "Lượt nêu danh sách nhiều món."}},
                {"user": cau2,
                 "expect": {"refers_to_position": {"turn": 1, "index": 1},
                            "expect_kind": "fact",
                            "why": "Tham chiếu thứ nhất — trỏ vào món ĐẦU của lượt 1."}},
                {"user": cau3,
                 "expect": {"refers_to_position": {"turn": 1, "index": vi_tri},
                            "expect_kind": "fact",
                            "why": "Tham chiếu thứ HAI, và đây là lượt đáng đo: nó phải trỏ vào "
                                   f"món thứ {vi_tri} của LƯỢT 1, không phải vào câu trả lời một "
                                   "món của lượt 2. Nếu dãy bị thay ở lượt 2 thì lượt này không "
                                   "trỏ được và hệ thống liệt kê lại một danh sách mới — mà danh "
                                   "sách đó lại CHỨA tên món của lượt 1, nên tiêu chí lỏng "
                                   "`refers_to_turn` vẫn cho qua. Đó là lý do phải dùng bản chặt."}},
            ],
        })

    # --- NHÓM 6: câu HỎI không được thành lời KHAI ------------------------------------
    #
    # Nhóm này cũng sinh ra từ một lỗi tìm được khi CHẠY THẬT, và là lỗi khách NHÌN THẤY:
    #
    #   lượt 1  "Cơm gà Hội An có hải sản không?"  -> hỏi về thành phần MỘT món
    #   lượt 2  "gợi ý món ăn giúp mình"           -> 26/91 món bị ẩn, và câu trả lời mở đầu
    #                                                 "thực đơn không ghi nhận thành phần bạn cần
    #                                                 tránh" — khẳng định điều khách chưa hề nói
    #
    # Nguyên nhân: cả câu KHAI và câu HỎI đều sinh `avoid_tags` (đúng — để trả lời được câu hỏi thì
    # phải biết nhãn), nhưng bộ nhớ ghi cả hai như nhau.
    #
    # Nhóm này đo CẢ HAI CHIỀU, và chiều thứ hai mới là chiều khó:
    #   chiều 1  câu HỎI  -> bộ nhớ KHÔNG được có nhãn đó
    #   chiều 2  câu KHAI -> bộ nhớ PHẢI có, và giữ suốt phiên (nhóm `allergy_persists` đã lo)
    #
    # Không có chiều 1 thì một hệ thống "an toàn quá mức" vẫn xanh mọi ca, dù nó ẩn 26 món của một
    # khách chỉ tò mò. Không có chiều 2 thì sửa chiều 1 sẽ phá mất chốt an toàn mà không ai biết.
    HOI_KHONG_PHAI_KHAI = [
        ("Cơm gà Hội An có hải sản không?", "allergen:seafood",
         "Hỏi về thành phần một món đã nêu tên."),
        ("Bún đậu mắm tôm có đậu phộng không?", "allergen:peanut",
         "Cùng dạng, nhãn khác — chốt rằng cơ chế đúng cho cả nhóm dị nguyên, không chỉ hải sản."),
    ]
    for i, (cau_hoi, nhan, ghi_chu) in enumerate(HOI_KHONG_PHAI_KHAI, 1):
        scripts.append({
            "id": f"question-not-declaration-{i:02d}",
            "group": "question_not_declaration",
            "why": ("Câu HỎI về thành phần một món KHÔNG phải lời KHAI dị ứng. Ghi nó vào bộ nhớ "
                    "làm 26/91 món bị ẩn suốt phiên và mọi câu sau đó khẳng định 'thành phần bạn "
                    "cần tránh' — một điều khách chưa nói. Lỗi này chỉ hiện khi chạy thật, vì nó "
                    "cần bộ nhớ sống qua nhiều lượt."),
            "turns": [
                {"user": cau_hoi,
                 "expect": {"expect_kind": "fact",
                            "memory_must_not_have_avoid": [nhan],
                            "why": f"{ghi_chu} Trả lời đúng về món đó, nhưng KHÔNG ghi nhãn "
                                   f"`{nhan}` vào bộ nhớ."}},
                {"user": "Gợi ý món ăn giúp mình",
                 "expect": {"min_items": 3,
                            "memory_must_not_have_avoid": [nhan],
                            "why": "Lượt sau phải thấy ĐỦ thực đơn. Nếu bộ nhớ đã ghi nhãn từ câu "
                                   "hỏi thì lượt này bị lọc và khách mất lựa chọn mà không hiểu "
                                   "vì sao."}},
                {"user": "Mình dị ứng " + ("hải sản" if nhan.endswith("seafood") else "đậu phộng"),
                 "expect": {"forbid_tags_any": [nhan],
                            "memory_must_have_avoid": [nhan],
                            "why": "CHIỀU NGƯỢC LẠI, và là chiều then chốt: khi khách KHAI thật thì "
                                   "bộ nhớ PHẢI ghi. Không có lượt này thì bản sửa chiều trên có "
                                   "thể phá chốt an toàn mà tập ca vẫn xanh."}},
                {"user": "Cho mình xem thêm vài món",
                 "expect": {"forbid_tags_any": [nhan],
                            "memory_must_have_avoid": [nhan],
                            "why": "Lượt KHÔNG nhắc dị ứng, sau lời khai. Phải còn được bảo vệ."}},
            ],
        })

    # Câu HỎI "ăn được gì" bị đọc thành lời KHAI "tôi ăn được" — và nó XÓA dị nguyên.
    #
    # Khác ba kịch bản trên ở chỗ chúng lo chiều "câu hỏi THÊM nhãn vào bộ nhớ"; kịch bản này lo
    # chiều ngược lại và nặng hơn: câu hỏi **GỠ** nhãn đã có. Đo trên mã trước bản sửa:
    #
    #     lượt 1  "Con mình dị ứng hải sản"      ->  avoid = [allergen:seafood]     đúng
    #     lượt 2  "Bé nhà mình ăn được món gì?"  ->  avoid = []                     XÓA MẤT
    #     lượt 3  "Cho mình món khai vị"         ->  Gỏi cuốn tôm thịt, Súp măng cua,
    #                                                Nem rán Hà Nội, Bánh xèo miền Tây
    #
    # Cụm `minh an duoc` trong danh sách xóa dị nguyên khớp đoạn "bé nhà MÌNH ĂN ĐƯỢC món gì".
    # Lỗi im lặng: lượt 2 không mời món nào nên câu trả lời trông vô hại, chỉ lượt 3 mới lộ — nên
    # nó cần đúng ba lượt, và bộ một lượt không thể bắt được.
    scripts.append({
        "id": "question-not-declaration-di-ung-tre-em",
        "group": "question_not_declaration",
        "why": ("Câu HỎI 'ăn được gì' bị đọc thành lời KHAI hết dị ứng và XÓA nhãn khỏi bộ nhớ. "
                "Trước bản sửa, lượt 3 mời bốn món hải sản cho phụ huynh vừa khai con dị ứng."),
        "turns": [
            {"user": "Con mình dị ứng hải sản",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "Lượt khai. Phải vào bộ nhớ ngay."}},
            {"user": "Bé nhà mình ăn được món gì?",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": ("Câu HỎI, không phải lời khai hết dị ứng. Kiểm BỘ NHỚ chứ không "
                                "chỉ kiểm câu trả lời: lượt này không mời món nào nên câu trả "
                                "lời trông vô hại kể cả khi ràng buộc đã mất.")}},
            {"user": "Cho mình món khai vị",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "min_items": 1,
                        "why": ("Lượt LỘ LỖI: bốn món khai vị mang nhãn hải sản, nên mất ràng "
                                "buộc là khách nhận đúng thứ vừa nói không ăn được.")}},
        ],
    })

    # Hỏi tiếp về danh sách vừa nêu — PHẠM VI phải thu về đúng danh sách đó.
    #
    # Kịch bản riêng, bắt đầu từ một danh sách chưa bị thu hẹp, để đo đúng một việc: câu hỏi tiếp
    # nối có ở lại trong danh sách không. Dò 10 cách hỏi sau một lượt nêu 4 món thì 3 cách đi ra
    # ngoài danh sách, và ca tệ nhất là:
    #
    #     "4 món đó có món nào chứa đậu phộng không?"  ->  4 món, nhưng KHÔNG PHẢI 4 món kia
    #
    # Đúng số lượng nên nhìn như trả lời đúng, mà bốn món trả về là bốn món khác. Khách hỏi về DỊ
    # NGUYÊN trong danh sách vừa xem và nhận câu trả lời về một danh sách khác — sai theo kiểu
    # không ai kiểm lại, vì nó trông hợp lý.
    scripts.append({
        "id": "chained-reference-hoi-tiep-trong-danh-sach",
        "group": "chained_reference",
        "why": ("Câu hỏi tiếp nối về danh sách vừa nêu phải ở LẠI trong danh sách đó. Bảng cụm thu "
                "phạm vi chỉ có bốn cụm, đều đòi chữ 'đó' đứng ngay sau, nên phần lớn cách nói "
                "thật rơi ra ngoài."),
        "turns": [
            {"user": "Gợi ý món không cay giúp mình",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Lượt nêu danh sách."}},
            {"user": "Trong đó món nào rẻ nhất?",
             "expect": {"max_items": 1,
                        "why": ("Cụm `trong do` không có trong bảng, nên câu cực trị chạy trên CẢ "
                                "thực đơn thay vì trên danh sách vừa nêu.")}},
            {"user": "Mấy món đó có món nào chay không?",
             "expect": {"expect_kind": "list",
                        "why": "Cụm `may mon do` cũng không có trong bảng."}},
        ],
    })

    # Tham chiếu vị trí VIẾT BẰNG SỐ — lượt khách dùng để trả lời câu hỏi lại của trợ lý.
    #
    # Bảng từ vựng chỉ có dạng CHỮ (`mon thu hai`), còn khách gõ SỐ. Đo được sau khi lượt 1 nêu
    # 4 món và lượt 2 đoán món đầu:
    #
    #     "món thứ hai"  ->  đúng món thứ 2
    #     "món thứ 2"    ->  KHÔNG nhận ra, rơi xuống nhánh lọc và trả về SÁU món
    #
    # Hậu quả nặng hơn "không hiểu": khách chỉ vào một món và nhận lại cả bảng, tức mất luôn phạm
    # vi danh sách đang nói tới. Và vì đây đúng là lượt dùng để SỬA phỏng đoán của trợ lý, hỏng ở
    # đây làm cả vòng hỏi-đáp thành ngõ cụt.
    scripts.append({
        "id": "context-reference-vi-tri-viet-so",
        "group": "context_reference",
        "why": ("Tham chiếu vị trí viết bằng SỐ. Trợ lý đoán món đầu và NÊU TÊN nó, nên khách sửa "
                "bằng cách chỉ số thứ tự — đó là đường sửa duy nhất, và nó từng hỏng."),
        "turns": [
            {"user": "Gợi ý 4 món ăn cho mình",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Lượt nêu danh sách."}},
            {"user": "Cho mình món vừa rồi",
             "expect": {"expect_kind": "clarify",
                        "why": ("Câu MƠ HỒ với 4 món trên màn hình, và là câu XIN MÓN — phải HỎI "
                                "LẠI kèm số thứ tự, không đoán. "
                                "Kỳ vọng cũ của ca này là `max_items: 1`, tức chốt hành vi 'đoán "
                                "món đầu nhưng nêu tên nó'. Hành vi đó vẫn ĐÚNG cho câu HỎI VỀ "
                                "một món ('Món đó bao nhiêu tiền?') — 12 lượt đánh giá dựa vào "
                                "nó, và hỏi lại ở đó là bước lùi vì khách chỉ hỏi một câu đơn "
                                "giản. Nhưng câu XIN thì khác: khách muốn LẤY một món, và đoán ở "
                                "đây là chọn hộ họ. "
                                "Phân loại bằng `XIN_MON_RE` đã có sẵn: đo trên 13 lượt đang dùng "
                                "tiêu điểm thì nó tách sạch 12 câu hỏi khỏi 1 câu xin, không cần "
                                "luật mới.")}},
            {"user": "món thứ 2",
             "expect": {"max_items": 1,
                        "why": ("Lượt SỬA. Phải trỏ đúng món thứ hai của danh sách, không được "
                                "trả về cả bảng.")}},
        ],
    })

    # Tham chiếu ngược có SỐ LƯỢNG — phạm vi đúng nhưng con số bị bỏ.
    #
    # `LIST_SIZE = 6` là hằng số, và con số trong câu chỉ dùng để bật một cờ. Sau khi lượt 1 nêu
    # 6 món: xin 3 món nhận 6, xin 4 món nhận 6, xin "2 món đầu" nhận **1** (cụm `mon dau` trỏ
    # *món thứ nhất*). Không phải trả lời sai, nhưng là KHÔNG NGHE.
    scripts.append({
        "id": "chained-reference-so-mon",
        "group": "chained_reference",
        "why": ("Tham chiếu ngược có SỐ LƯỢNG. Phạm vi được giữ đúng từ trước; chỉ con số bị bỏ "
                "vì cỡ danh sách là hằng số."),
        "turns": [
            {"user": "Gợi ý món không cay giúp mình",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Lượt nêu danh sách. Các lượt sau tham chiếu vào đây."}},
            {"user": "Liệt kê 3 món vừa tư vấn bên trên",
             "expect": {"min_items": 3, "max_items": 3, "expect_kind": "list",
                        "why": ("Xin ĐÚNG 3. Kiểm cả cận trên lẫn cận dưới — chỉ kiểm `min_items` "
                                "thì trả về 6 vẫn qua.")}},
            {"user": "Liệt kê cho tôi 2 món đầu vừa tư vấn",
             "expect": {"min_items": 2, "max_items": 2, "expect_kind": "list",
                        "why": ("«2 món đầu» là LÁT CẮT. Cụm `mon dau` trỏ `reference_index = 1` "
                                "nên câu này từng bị đọc thành *món thứ nhất*.")}},
            {"user": "Cho mình xem lại 3 món vừa rồi",
             "expect": {"min_items": 2, "max_items": 2, "expect_kind": "list",
                        "why": ("HAI món, không phải ba — và đó là câu trả lời ĐÚNG. Lượt trước "
                                "đã thu danh sách còn 2 món, nên 'vừa rồi' chỉ còn 2 món để lấy. "
                                "Trước khi cụm này thu phạm vi, nó trả về 3 món lấy từ danh sách "
                                "GỐC: đúng số nhưng SAI TẬP, tức trả lời về một danh sách khác "
                                "với danh sách khách đang nói tới. "
                                "Ca này cũng chốt luôn cờ `refers_to_focus`: cụm 'vừa rồi' từng "
                                "được giải thành MỘT món, nên câu trả về đúng 1.")}},
            {"user": "Món vừa rồi giá bao nhiêu?",
             "expect": {"max_items": 1,
                        "why": ("CHIỀU NGƯỢC. Không có số lượng thì 'vừa rồi' vẫn phải trỏ MỘT "
                                "món — nới quy tắc quá tay ở đây làm câu hỏi giá của một món trả "
                                "về nửa danh sách.")}},
        ],
    })

    # Cùng lớp lỗi với `chained-reference-so-mon`, nhưng qua một đường KHÁC: số viết bằng CHỮ.
    #
    # Hai regex đọc số lượng trong `understand` chỉ nhận chữ số, nên "hai món đầu" không đặt
    # `so_mon_muon`; phép sửa lát cắt không chạy, và `mon dau tien` giữ nguyên `reference_index = 1`
    # — câu bị đọc thành *món thứ nhất*. Đo được:
    #
    #     "Nhắc lại 2 món đầu"        ->  filter, ĐÚNG 2 món
    #     "Nhắc lại hai món đầu tiên" ->  item_detail, 1 món
    #
    # Hai cách nói tương đương, hai kết quả khác hẳn nhau — và bản vá trước chỉ vá dạng chữ số.
    scripts.append({
        "id": "chained-reference-so-viet-chu",
        "group": "chained_reference",
        "why": ("Tham chiếu ngược có số lượng viết BẰNG CHỮ. Bản vá trước chỉ nhận chữ số, nên "
                "«hai món đầu» rơi về `reference_index = 1` và trả về đúng một món."),
        "turns": [
            {"user": "Gợi ý món không cay giúp mình",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Lượt nêu danh sách. Hai lượt sau tham chiếu vào đây."}},
            {"user": "Nhắc lại hai món đầu tiên",
             "expect": {"min_items": 2, "max_items": 2, "expect_kind": "list",
                        "why": ("«hai món đầu» là LÁT CẮT dài 2, không phải món thứ nhất. Kiểm cả "
                                "cận trên: chỉ kiểm `min_items` thì trả về 6 vẫn qua.")}},
            {"user": "Nhắc lại ba món đầu",
             "expect": {"min_items": 2, "max_items": 3, "expect_kind": "list",
                        "why": ("«ba» cũng nằm trong `_SO_CHU`, kiểm để bản sửa không chỉ đúng cho "
                                "«hai». Cận dưới là 2 vì lượt trước đã thu phạm vi còn 2 món — xin "
                                "ba mà chỉ còn hai thì trả về hai là ĐÚNG.")}},
        ],
    })

    # --- Nhóm `extreme_scope`: câu cực trị phải nói ra PHẠM VI của nó -------------------
    #
    # Cả nhóm sinh ra từ một lỗi đo được khi CHẠY THẬT qua backend và mô hình: câu "Món đắt nhất
    # giá bao nhiêu?" trả lời "Món đắt nhất là Cháo lòng Sài Gòn, giá 45.000đ". Tên món và giá đều
    # có thật trong thực đơn — nên mọi phép kiểm về việc bịa dữ liệu đều xanh — mà khẳng định thì
    # sai: nó chỉ đúng trong ngân sách đang có hiệu lực, và ngân sách đó vào bộ nhớ từ một câu
    # KHÔNG khai ngân sách ("Phở bò tái nạm giá 45.000đ đúng không?").
    #
    # Không tập nào cũ bắt được: 139 ca đều một lượt, và 82 lượt cũ không có câu cực trị nào sau
    # một lượt nêu ngân sách.
    #
    # Mã món trong tiêu chí TÍNH TỪ THỰC ĐƠN, không viết tay — giá đổi thì bộ sinh đổi theo.
    #
    # Và tiêu chí phải TRÁNH CHỖ HÒA GIÁ. Bản đầu chốt "phải nhắc Bún đậu mắm tôm" cho ngưỡng
    # 100.000đ, trong khi có 5 món cùng giá 95.000đ — tiêu chí đó qua được chỉ nhờ thứ tự phá hòa
    # của bảng xếp hạng, và nó có thể đỏ khi hệ thống hoàn toàn đúng. Ca đỏ sai lý do cũng tệ như ca
    # xanh sai lý do: cả hai làm bảng kết quả nói sai.
    #
    # Nên: giá cực trị DUY NHẤT thì chốt món; có hòa thì chốt GIÁ. Giá vẫn phân biệt được đắt nhất
    # với rẻ nhất, mà không phụ thuộc thứ tự.
    def cuc_tri(pool: list[dict]) -> tuple[dict, list[dict]]:
        cao = max(i["price"] for i in pool)
        hoa = [i for i in pool if i["price"] == cao]
        return max(pool, key=lambda i: i["price"]), hoa

    def dong_tien(gia: int) -> str:
        return f"{gia:,}".replace(",", ".") + "đ"

    dat_nhat_toan_bo, hoa_toan_bo = cuc_tri(items)
    duoi_100k = [i for i in items if i["price"] <= 100_000]
    dat_nhat_100k, hoa_100k = cuc_tri(duoi_100k)
    # Hàng rào, không phải chú thích: `extreme-scope-02` chốt MÓN, nên nó chỉ đúng khi giá cao nhất
    # của cả thực đơn là duy nhất. Nếu về sau có món thứ hai cùng giá thì bộ sinh DỪNG, thay vì sinh
    # ra một tiêu chí phụ thuộc thứ tự phá hòa.
    if len(hoa_toan_bo) != 1:
        raise SystemExit(
            f"{len(hoa_toan_bo)} món cùng giá cao nhất ({dat_nhat_toan_bo['price']:,}đ): "
            "`extreme-scope-02` chốt theo món nên không dùng được. Đổi sang `must_say_all` với "
            "giá, như `extreme-scope-01` đã làm."
        )
    pho_bo = next(i for i in items if i["name"] == "Phở bò tái nạm")

    scripts.append({
        "id": "extreme-scope-01",
        "group": "extreme_scope",
        "why": ("Câu cực trị SAU khi khách nêu ngân sách. Phải nêu đúng món đắt nhất trong ngân "
                "sách, và phải NÓI RA rằng nó đang xét trong phạm vi đó."),
        "turns": [
            {"user": "Cho mình món ăn dưới 100.000đ",
             "expect": {"expect_kind": "list",
                        "memory_budget_max": 100_000,
                        "why": "Lượt khai ngân sách. Phải vào bộ nhớ để lượt sau có phạm vi."}},
            {"user": "Món đắt nhất giá bao nhiêu?",
             "expect": {"expect_kind": "fact",
                        "must_say_all": ["trong phạm vi", dong_tien(dat_nhat_100k["price"])],
                        "memory_budget_max": 100_000,
                        "why": f"Hai tiêu chí trong một khóa, hai lỗi khác nhau. Giá "
                               f"{dong_tien(dat_nhat_100k['price'])} chốt hệ thống lấy món ĐẮT "
                               f"nhất trong ngân sách, không phải món rẻ nhất "
                               f"({dong_tien(min(i['price'] for i in duoi_100k))}). Cụm 'trong "
                               f"phạm vi' chốt câu trả lời nói ra phạm vi của nó; thiếu cụm đó thì "
                               f"khách đọc được một khẳng định tuyệt đối sai.\n"
                               f"Chốt GIÁ chứ không chốt MÓN vì {len(hoa_100k)} món cùng giá "
                               f"{dong_tien(dat_nhat_100k['price'])} — chốt món thì tiêu chí phụ "
                               f"thuộc thứ tự phá hòa và có thể đỏ khi hệ thống đúng."}},
        ],
    })
    scripts.append({
        "id": "extreme-scope-02",
        "group": "extreme_scope",
        "why": ("Chiều KHÔNG có ràng buộc. Không có kịch bản này thì một bản 'luôn thêm trong phạm "
                "vi bạn nêu' cũng xanh, và bản đó nói sai ở mọi câu không có ràng buộc."),
        "turns": [
            {"user": "Món đắt nhất giá bao nhiêu?",
             "expect": {"expect_kind": "fact",
                        "must_name_item": [dat_nhat_toan_bo["id"]],
                        "must_not_say_any": ["trong phạm vi"],
                        "why": f"Không ràng buộc nào, nên phạm vi là cả thực đơn: "
                               f"{dat_nhat_toan_bo['name']} "
                               f"({dong_tien(dat_nhat_toan_bo['price'])}).\n"
                               f"`must_not_say_any` là tiêu chí LÀM VIỆC của kịch bản này: không có "
                               f"nó thì một bản 'luôn thêm trong phạm vi bạn nêu' cũng xanh, và "
                               f"bản đó nói sai ở mọi câu không có ràng buộc. Chốt món dùng được ở "
                               f"đây vì giá {dong_tien(dat_nhat_toan_bo['price'])} là DUY NHẤT "
                               f"trong thực đơn — không có chỗ hòa để phá."}},
        ],
    })
    scripts.append({
        "id": "price-premise-01",
        "group": "extreme_scope",
        "why": ("Nguyên nhân GỐC của lỗi trên: giá khách KHẲNG ĐỊNH bị lưu thành ngân sách phiên "
                "rồi dính lại."),
        "turns": [
            {"user": "Phở bò tái nạm giá 45.000đ đúng không?",
             "expect": {"expect_kind": "fact",
                        "must_name_item": [pho_bo["id"]],
                        "memory_budget_max": None,
                        "why": f"Phải đính chính theo thực đơn ({pho_bo['price']:,}đ) và KHÔNG lưu "
                               f"45.000đ thành ngân sách. `memory_budget_max: null` là tiêu chí "
                               f"quan trọng nhất của kịch bản — câu trả lời lượt này có thể trông "
                               f"đúng trong khi bộ nhớ đã nhiễm."}},
            {"user": "Món đắt nhất giá bao nhiêu?",
             "expect": {"expect_kind": "fact",
                        "must_name_item": [dat_nhat_toan_bo["id"]],
                        "why": f"Lượt LỘ RA lỗi. Nếu lượt 1 nhiễm bộ nhớ thì câu này trả lời một "
                               f"món 45.000đ thay vì {dat_nhat_toan_bo['name']} — đúng dữ liệu, "
                               f"sai sự thật."}},
        ],
    })

    # ---------------------------------------------------------------- ba nhóm HỘI THOẠI
    #
    # Ba nhóm này thêm vào sau khi hệ thống chạy THẬT trên production, và cả ba tương ứng một lỗi mà
    # 103 lượt golden + 140 ca + 87 lượt phiên đều KHÔNG bắt được:
    #
    #     "xin chào"                  -> đổ ra danh sách rượu nếp cẩm, cà phê trứng, trà sen
    #     "tư vấn thêm đi"            -> y nguyên 6 món vừa nêu
    #     "tôi không còn dị ứng nữa"  -> vẫn lọc, rồi khách KẸT không gỡ được
    #
    # Đây là phát hiện về TẬP ĐÁNH GIÁ, không phải về hệ thống: 33 kịch bản cũ do một người viết,
    # nên chúng mang đúng thiên lệch của người đó. Người viết một tập về ẩm thực Việt hỏi "món nào
    # không cay", "nhóm 4 người ăn gì" — chứ không hỏi "xin chào".
    #
    # Cách phá thiên lệch không phải viết thêm ca cùng kiểu, mà là lấy câu từ NGUỒN KHÁC — ở đây là
    # log dùng thật.
    scripts.append({
        "id": "social-intent-01",
        "group": "social_intent",
        "why": ("Lời chào phải là lời chào. Cổng `answer.thuoc_mien()` lẽ ra chặn, nhưng nó là phép "
                "OR trên TỪNG TỪ ĐƠN của mọi tên món sau khi rút dấu — nên `chao` của 'xin chào' "
                "khớp món 'Cháo lòng Sài Gòn' và câu lọt xuống nhánh truy hồi toàn kho, nơi KHÔNG "
                "có ngưỡng tương đồng. Vụ đụng chữ thứ tám của dự án."),
        "turns": [
            {"user": "xin chào",
             "expect": {"expect_kind": "fact", "max_items": 0, "must_say_all": ["món ăn"],
                        "why": "Chào lại và NÊU PHẠM VI. Lượt đầu là chỗ khách học được trợ lý "
                               "này làm gì."}},
            {"user": "tư vấn tôi món cho 4-5 người",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Chào xong vẫn phải tư vấn được — nhánh xã giao không được nuốt "
                               "lượt sau."}},
            {"user": "cảm ơn bạn nhé",
             "expect": {"expect_kind": "fact", "max_items": 0,
                        "why": "Lời cảm ơn không phải câu hỏi. Trả một danh sách món là sai LOẠI "
                               "đáp án, không phải sai nội dung."}},
        ],
    })
    scripts.append({
        "id": "social-intent-02",
        "group": "social_intent",
        "why": "Chiều ngược: một chữ xã giao lọt vào đầu câu KHÔNG được nuốt yêu cầu thật.",
        "turns": [
            {"user": "xin chào, cho mình xem món chay",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "forbid_tags_any": ["allergen:seafood"], "must_say_all": ["chay"],
                        "why": "Câu này có ràng buộc `diet:vegetarian`, nên nó là câu hỏi món chứ "
                               "không phải lời chào. Kiểm bằng chính món nêu ra — đây LÀ lượt đầu "
                               "nên không mượn được lượt trước."}},
            {"user": "nhà hàng có cháo không",
             "expect": {"min_items": 1, "expect_kind": "list",
                        "why": "`chao` là món CHÁO, không phải lời chào. Đây là chiều còn lại của "
                               "vụ đụng chữ thứ tám."}},
        ],
    })
    scripts.append({
        "id": "ask-for-more-01",
        "group": "ask_for_more",
        "why": ("'tư vấn thêm đi' trả lại Y NGUYÊN 6 món của lượt trước. Từ vựng có "
                "`mon khac|cai khac|thu khac` nhưng KHÔNG có 'thêm', 'còn gì nữa'."),
        "turns": [
            {"user": "tư vấn tôi món cho 4-5 người",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Lượt nền, để lượt sau có gì mà lặp."}},
            {"user": "tư vấn thêm đi",
             "expect": {"must_not_repeat_turn": 1,
                        "why": "Lượt bắt lỗi. Lặp lại danh sách cũ là đúng điều đã đo trên "
                               "production, và với khách thì hệ thống trông như không nghe."}},
            {"user": "còn gì nữa không",
             "expect": {"must_not_repeat_turn": 2, "expect_kind": "clarify",
                        "must_say_any": ["hết", "bỏ bớt"],
                        "why": "Cách nói thứ hai của cùng ý định. Sau khi đã duyệt hết, câu ĐÚNG "
                               "là NÓI RÕ đã hết và mời nới điều kiện — không phải im lặng, cũng "
                               "không phải lặp danh sách."}},
        ],
    })
    scripts.append({
        "id": "ask-for-more-02",
        "group": "ask_for_more",
        "why": ("Chiều ngược: xin THÊM phải GIỮ ràng buộc, không được đọc thành 'bỏ ràng buộc rồi "
                "lấy món khác'. Đây là chỗ cơ chế loại-món-đã-gợi dễ đi quá tay nhất."),
        "turns": [
            {"user": "gợi ý món chay cho mình",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Lượt nền, và nó mang ràng buộc rõ để lượt sau đối chiếu được."}},
            {"user": "cho mình thêm món chay nữa",
             "expect": {"must_match_turn_constraint": 1, "must_not_repeat_turn": 1,
                        "why": "Hai điều cùng lúc, và đó là toàn bộ ý nghĩa của 'xin thêm': món "
                               "MỚI (không lặp) mà VẪN chay (giữ ràng buộc). Mất điều thứ nhất là "
                               "hệ thống trông như không nghe; mất điều thứ hai là khách xin món "
                               "chay và nhận món mặn."}},
        ],
    })
    scripts.append({
        "id": "clear-constraint-01",
        "group": "clear_constraint",
        "why": ("Khách khai dị ứng rồi nói hết dị ứng. `session` hợp nhất dị nguyên bằng phép HỢP "
                "và không có đường bỏ, nên khách KẸT: câu sau hỏi món hải sản nhận `no_data`."),
        "turns": [
            {"user": "Mình dị ứng hải sản, gợi ý món ăn giúp mình",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "Lượt khai. Phải vào bộ nhớ ngay."}},
            {"user": "Cho mình món khác đi",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "CHỐT AN TOÀN: xin món khác KHÔNG phải xin bỏ dị ứng."}},
            {"user": "tôi không còn dị ứng nữa",
             "expect": {"memory_must_not_have_avoid": ["allergen:seafood"],
                        "must_say_all": ["hải sản"],
                        "why": "Bỏ được, VÀ phải NÓI RA thứ vừa bỏ. Hạ một hàng rào an toàn mà im "
                               "lặng thì khách không có cách nào biết để sửa nếu hệ thống hiểu sai "
                               "câu của họ — và với dị nguyên, hiểu sai theo hướng này là lỗi nguy "
                               "hiểm nhất hệ thống có thể mắc."}},
            {"user": "vậy gợi ý món hải sản đi",
             "expect": {"min_items": 2, "expect_kind": "list",
                        "why": "Bỏ ràng buộc xong mà vẫn không gợi được món là chưa bỏ THẬT. Lượt "
                               "này bắt đúng lỗi 'bộ nhớ ghi lại chính cái vừa xóa'."}},
        ],
    })
    scripts.append({
        "id": "clear-constraint-02",
        "group": "clear_constraint",
        "why": "CHỐT AN TOÀN theo chiều ngược: dị nguyên chỉ được bỏ khi khách nói RÕ.",
        "turns": [
            {"user": "Mình không ăn được đồ tanh",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "Cách nói dân dã của lời khai dị ứng."}},
            {"user": "cảm ơn bạn",
             "expect": {"memory_must_have_avoid": ["allergen:seafood"],
                        "why": "Lời cảm ơn KHÔNG được bỏ ràng buộc an toàn."}},
            {"user": "còn gì nữa không",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "Xin thêm cũng không. Chỉ câu nói RÕ mới bỏ được."}},
        ],
    })

    scripts.append({
        "id": "answer-own-question-01",
        "group": "clear_constraint",
        "why": ("Hệ thống HỎI một câu có/không rồi KHÔNG hiểu câu trả lời. Đo được trên production: "
                "nó hỏi 'Bạn muốn mình bỏ bớt một điều kiện để có thêm lựa chọn không?', khách đáp "
                "'bỏ và tư vấn thêm đi', và nhận lại ĐÚNG câu hỏi đó — lặp mãi. Tệ hơn: chữ 'bỏ' rút "
                "dấu thành `bo`, mà `bo` là nhãn ingredient:beef, nên khách xin BỎ điều kiện lại bị "
                "THÊM ràng buộc thịt bò."),
        "turns": [
            {"user": "gợi ý món cho 2 người",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "memory_must_have_require": ["party:two_three"],
                        "why": "Lượt nền, và nó đặt một ràng buộc để lượt sau nới được."}},
            {"user": "tư vấn thêm đi",
             "expect": {"must_not_repeat_turn": 1,
                        "why": "Xin thêm phải ra món mới."}},
            {"user": "tư vấn thêm món cho mình",
             "expect": {"expect_kind": "clarify", "must_say_any": ["hết", "bỏ bớt"],
                        "why": "Hết món thì NÓI RÕ và đặt một đề nghị. Lượt này tạo ra câu hỏi mà "
                               "lượt sau phải trả lời được."}},
            {"user": "bỏ và tư vấn thêm đi",
             "expect": {"min_items": 2, "expect_kind": "list",
                        "memory_must_not_have_require": ["party:two_three"],
                        "why": "Đây là lượt bắt lỗi. Hệ thống phải hiểu đây là lời ĐỒNG Ý với đề "
                               "nghị nó vừa đưa ra, nới ràng buộc lọc, và nêu món mới — chứ không "
                               "lặp lại câu hỏi."}},
        ],
    })
    scripts.append({
        "id": "answer-own-question-02",
        "group": "clear_constraint",
        "why": ("CHỐT AN TOÀN của cơ chế trên: lời đồng ý nới điều kiện KHÔNG được hạ hàng rào dị "
                "nguyên. Khách đồng ý xem thêm lựa chọn không có nghĩa là họ hết dị ứng."),
        "turns": [
            {"user": "Mình dị ứng hải sản, cho mình món cay đậm cho 3-5 người",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "Ràng buộc chồng nhau để dễ cạn món."}},
            {"user": "còn gì nữa không",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "Dù cạn hay không, dị nguyên phải còn."}},
            {"user": "ừ bỏ bớt đi",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "LƯỢT QUAN TRỌNG NHẤT: nới điều kiện lọc thì được, nhưng dị nguyên "
                               "phải giữ. Một cơ chế tiện lợi hạ mất chốt an toàn là cách tệ nhất "
                               "để nó hỏng, vì nó hỏng trong lúc trông như đang giúp khách."}},
        ],
    })

    # ---------------------------------------------------------------------------------------
    # BA NHÓM DƯỚI ĐÂY RA ĐỜI TỪ MỘT PHIÊN GÕ TAY, KHÔNG PHẢI TỪ TEST.
    #
    # Sáu lỗi bị bắt trong một hội thoại duy nhất của người dùng, và **không lỗi nào** bị 140 ca
    # trả lời hay 111 lượt phiên bắt được. Lý do rất cụ thể: bộ đánh giá cũ toàn câu VIẾT ĐÚNG
    # KIỂU — "cho mình món chay dưới 100 nghìn". Khách thật thì phủ nhận, đổi ý, nhắc lại chủ đề,
    # và chuyển chủ đề giữa chừng.
    #
    # Nên ba nhóm này không phải "thêm ca cho đủ số". Chúng là hình dạng câu mà bộ cũ không có.
    # ---------------------------------------------------------------------------------------
    scripts.append({
        "id": "denial-frame-01",
        "group": "denial_frame",
        "why": ("Câu PHỦ ĐỊNH chứa nguyên văn cụm bị phủ định. Bộ khớp cụm thấy `khong an duoc cay` "
                "trong 'tôi đâu có nói là không ăn được cay' và gán `spice:none` — đúng thứ khách "
                "vừa chối. Va chạm chữ ở tầng CÂU thay vì tầng từ."),
        "turns": [
            {"user": "tư vấn cho mình thực đơn cho bàn 4-5 người",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Lượt nền, chưa nói gì về độ cay."}},
            {"user": "tôi đâu có nói là không ăn được cay",
             "expect": {"memory_must_not_have_require": ["spice:none"],
                        "why": "LƯỢT QUAN TRỌNG NHẤT: phủ nhận phải BỎ ràng buộc, không được ÁP nó. "
                               "Áp nó là gán cho khách một điều kiện họ vừa chối, và họ không có "
                               "cách nào gỡ ngoài việc đoán ra câu thần chú."}},
            {"user": "tư vấn cho tôi các món cay đi",
             "expect": {"min_items": 1, "expect_kind": "list",
                        "forbid_tags_any": ["spice:none"],
                        "memory_must_not_have_require": ["spice:none"],
                        "why": "Từ vựng nói được 'không cay' nhưng không nói được 'cay' — bất đối "
                               "xứng một chiều: khách vào được ràng buộc mà không có đường ra."}},
        ],
    })
    scripts.append({
        "id": "denial-frame-02",
        "group": "denial_frame",
        "why": "Khung phủ định RỜI: 'tôi CÓ nói … ĐÂU'. Phần bị phủ nhận nằm giữa hai mảnh.",
        "turns": [
            {"user": "cho mình món chay",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "mình có nói là ăn chay đâu",
             "expect": {"memory_must_not_have_require": ["diet:vegetarian"],
                        "why": "'đâu' cuối câu là dấu phủ định; 'đâu' giữa câu là từ để hỏi "
                               "('ăn ở đâu'). Phân biệt bằng VỊ TRÍ, không bằng danh sách ngoại lệ."}},
        ],
    })
    scripts.append({
        "id": "denial-frame-03-allergen",
        "group": "denial_frame",
        "safety": True,
        "why": ("Phủ nhận DỊ NGUYÊN. Đây là ca phải rất cẩn thận: không được ÁP nhãn dị nguyên từ "
                "một câu chối, nhưng cũng không được bỏ nó trong im lặng."),
        "turns": [
            {"user": "mình dị ứng hải sản, gợi ý món giúp mình",
             "expect": {"memory_must_have_avoid": ["allergen:seafood"],
                        "forbid_tags_any": ["allergen:seafood"],
                        "why": "Lượt nền: hàng rào phải dựng lên đã, thì mới đo được việc hạ nó."}},
            {"user": "à mình nhầm, mình đâu có dị ứng hải sản",
             "expect": {"memory_must_not_have_avoid": ["allergen:seafood"],
                        "must_say_any": ["đã bỏ"],
                        "why": "Khách TỰ SỬA lời khai. Bỏ được, nhưng phải NÓI RA — hạ một hàng rào "
                               "an toàn trong im lặng là cách tệ nhất để hạ nó, vì khách không có "
                               "cách nào biết để sửa lại nếu hệ thống hiểu nhầm."}},
        ],
    })
    scripts.append({
        "id": "ask-new-same-topic-01",
        "group": "ask_new_same_topic",
        "why": ("Khách nhắc lại chủ đề khi xin thêm. Cụm `mon khac` đòi hai chữ ĐI LIỀN, nên "
                "'tư vấn món CHAY khác đi' mất tín hiệu và trả lại y nguyên 6 món vừa đọc."),
        "turns": [
            {"user": "cho mình món chay",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "tư vấn món chay khác đi",
             "expect": {"must_not_repeat_turn": 1, "min_items": 1,
                        "why": "Nhắc lại chủ đề là để GIỮ ràng buộc, không phải để xin lại đúng "
                               "những món vừa đọc. Hỏi thêm tức là muốn món khác."}},
        ],
    })
    scripts.append({
        "id": "ask-new-same-topic-02",
        "group": "ask_new_same_topic",
        "why": "Cùng nguyên tắc, diễn đạt bằng 'còn … nữa không' và bằng ngân sách thay vì danh mục.",
        "turns": [
            {"user": "cho mình món dưới 100 nghìn",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "còn món nào dưới 100 nghìn nữa không",
             "expect": {"must_not_repeat_turn": 1, "memory_budget_max": 100000,
                        "why": "Vừa không lặp, vừa GIỮ ngân sách. Không lặp mà bỏ ràng buộc thì "
                               "khách nhận món ngoài tầm tiền — sai theo hướng khác. Dùng "
                               "`memory_budget_max` vì `must_match_turn_constraint` chỉ đọc "
                               "`require_tags`, mà ngân sách không nằm ở đó."}},
        ],
    })
    scripts.append({
        "id": "ask-new-same-topic-03",
        "group": "ask_new_same_topic",
        "why": "'món mới' là XIN THÊM, không phải một ràng buộc — thực đơn không có nhãn 'mới'.",
        "turns": [
            {"user": "gợi ý món cho 2 người",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "cho mình món mới đi",
             "expect": {"must_not_repeat_turn": 1, "min_items": 1}},
        ],
    })
    scripts.append({
        "id": "topic-switch-01",
        "group": "topic_switch",
        "why": ("Hỏng NẶNG NHẤT trong nhóm: ràng buộc số người từ lượt trước giao với chủ đề mới ra "
                "RỖNG, và câu 'chưa tìm được món nào' là ngõ cụt — khách tưởng nhà hàng không có "
                "món chay, trong khi thực đơn có 17 món."),
        "turns": [
            {"user": "gợi ý món cho 2 người",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "chuyển sang món chay đi",
             "expect": {"must_say_any": ["bỏ điều kiện", "đang chặn"],
                        "why": "Rỗng thì phải NÊU điều kiện chặn và MỜI bỏ. Mời khác nới: nới là hệ "
                               "thống tự hạ hàng rào, mời là khách quyết."}},
            {"user": "ừ bỏ đi",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "must_say_all": ["đã bỏ"],
                        "why": "Đồng ý thì phải ra món CHAY. Bỏ điều kiện được hỏi, không được cuốn "
                               "theo cả chủ đề khách vừa nêu — đo được là nó trả về 6 món có thịt."}},
        ],
    })
    scripts.append({
        "id": "topic-switch-02",
        "group": "topic_switch",
        "why": "Đổi sang ĐỒ UỐNG — ranh giới món ăn/đồ uống là thứ hệ thống phải phân biệt được.",
        "turns": [
            {"user": "cho mình món chay",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "cho mình đồ uống",
             "expect": {"min_items": 3, "memory_wants": "drink",
                        "why": "Chủ đề mới thay chủ đề cũ hoàn toàn. Đồ chay không được kéo sang."}},
        ],
    })
    scripts.append({
        "id": "topic-switch-03",
        "group": "topic_switch",
        "why": "'đổi chủ đề khác đi' không nhắc chữ 'món' nên không cụm xin-thêm nào bắt được.",
        "turns": [
            {"user": "gợi ý món cho 2 người",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "đổi chủ đề khác đi",
             "expect": {"must_not_repeat_turn": 1, "min_items": 1,
                        "why": "Khách nói rõ muốn thứ khác. Trả lại y nguyên danh sách cũ là câu "
                               "trả lời ngược với điều vừa được yêu cầu."}},
        ],
    })

    # ---------------------------------------------------------------------------------------
    # HỎI LIÊN TỤC, PHỦ NHẬN, ĐỔI CHỦ ĐỀ — ba hội thoại DÀI, không phải ba lượt lẻ.
    #
    # Bốn lỗi dưới đây chỉ hiện ở lượt thứ 3 trở đi, khi bộ nhớ đã tích đủ thứ để va vào nhau. Kịch
    # bản hai lượt không chạm tới được, và cả 140 ca một lượt cũng vậy.
    # ---------------------------------------------------------------------------------------
    scripts.append({
        "id": "hoi-lien-tuc-01",
        "group": "hoi_lien_tuc",
        "why": ("Khách hỏi tiếp bằng những cách rất ngắn. `hết chưa` không cụm nào bắt được nên nó "
                "lặp Y NGUYÊN danh sách vừa nêu."),
        "turns": [
            {"user": "gợi ý món cho 2 người",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "món khác đi",
             "expect": {"must_not_repeat_turn": 1, "min_items": 1}},
            {"user": "còn nữa không",
             "expect": {"must_not_repeat_turn": 2,
                        "why": "Hết món thì nói ĐÃ HẾT và mời bỏ bớt điều kiện — vẫn không được "
                               "nhắc lại món khách vừa xem."}},
            {"user": "nữa đi",
             "expect": {"min_items": 3, "must_say_all": ["đã bỏ"],
                        "why": "Trả lời câu hỏi có/không của lượt trước. Bỏ điều kiện thì phải NÓI "
                               "RA, để khách sửa được nếu hệ thống hiểu sai."}},
            {"user": "hết chưa",
             "expect": {"must_not_repeat_turn": 4, "min_items": 1,
                        "why": "LƯỢT BẮT LỖI: `hết chưa` là hỏi tiếp, không phải hỏi lại. Lặp y "
                               "nguyên là câu trả lời vô nghĩa với khách đang chờ món mới."}},
        ],
    })
    scripts.append({
        "id": "phu-nhan-roi-doi-chu-de-01",
        "group": "hoi_lien_tuc",
        "safety": True,
        "why": ("Khách tự sửa lời khai dị ứng giữa phiên. Bỏ hàng rào xong mà mất luôn chủ đề đang "
                "xem thì khách gỡ đúng thứ che tầm nhìn của mình rồi vẫn không thấy gì."),
        "turns": [
            {"user": "giờ cho mình món hải sản",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "mình dị ứng tôm nhé",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "memory_must_have_avoid": ["allergen:seafood"],
                        "why": "CHỐT AN TOÀN. Khai dị ứng là hàng rào dựng lên ngay, kể cả khi nó "
                               "xóa sạch chủ đề khách vừa chọn."}},
            {"user": "à mình đâu có dị ứng tôm",
             "expect": {"memory_must_not_have_avoid": ["allergen:seafood"],
                        "must_say_any": ["đã bỏ"], "min_items": 3,
                        "why": "LƯỢT BẮT LỖI: khách gỡ hàng rào là để THẤY LẠI món bị che. Trả 1 "
                               "món sót hoặc trả danh sách không liên quan đều là trả lời hụt."}},
            {"user": "cho mình món cay vào",
             "expect": {"min_items": 1, "forbid_tags_any": ["spice:none"],
                        "why": "Và sau đó vẫn nhận được ràng buộc mới bình thường."}},
        ],
    })
    scripts.append({
        "id": "doi-chu-de-lien-tuc-01",
        "group": "hoi_lien_tuc",
        "why": ("`wants` kéo từ lượt trước đè lên danh mục khách vừa gọi tên: hỏi tráng miệng mà "
                "nhận lại đúng 6 đồ uống của lượt trước."),
        "turns": [
            {"user": "cho mình món lẩu",
             "expect": {"min_items": 3, "expect_kind": "list"}},
            {"user": "uống gì hợp với lẩu",
             "expect": {"min_items": 3, "memory_wants": "drink",
                        "why": "Món đang ăn là NGỮ CẢNH, câu hỏi là về đồ uống."}},
            {"user": "tráng miệng có gì",
             "expect": {"must_not_repeat_turn": 2, "min_items": 3,
                        "why": "LƯỢT BẮT LỖI: khách gọi tên một nhóm món là đã nói rõ mình muốn gì. "
                               "`wants` kế thừa chỉ có nghĩa cho câu KHÔNG nói gì."}},
            {"user": "quán mấy giờ đóng cửa",
             "expect": {"expect_kind": "fact", "max_items": 0,
                        "why": "Câu chính sách không được kéo theo danh sách món."}},
            {"user": "quay lại món ăn đi, cho mình món nướng",
             "expect": {"min_items": 3, "expect_kind": "list",
                        "why": "Và quay lại được: một câu chính sách xen giữa không được làm mất "
                               "khả năng tư vấn món."}},
        ],
    })

    # ---------------------------------------------------------------------------------------
    # COMBO và XUNG ĐỘT DỊ NGUYÊN — bốn vấn đề người dùng báo sau khi dùng thật.
    # ---------------------------------------------------------------------------------------
    scripts.append({
        "id": "combo-nhieu-suat-01",
        "group": "combo",
        "why": ("Khách xin một BỘ món, mỗi loại một suất. Nhiều danh mục trong một câu chỉ thành "
                "phép HOẶC, mà khách đang xin phép CỘNG — nên câu này từng trả 6 món khai vị/chay "
                "và KHÔNG có đồ uống nào."),
        "turns": [
            {"user": ("Mình đi một mình, mình muốn tư vấn 1 món ăn nhẹ gồm 1 món chính, "
                      "1 thức uống, 1 tráng miệng"),
             "expect": {"min_items": 3, "expect_kind": "list", "must_say_all": ["Tổng:"],
                        "why": "Ba suất thì ít nhất ba món, và câu trả lời phải nêu TỔNG TIỀN — "
                               "khách hỏi một bộ là đang hỏi mình phải trả bao nhiêu."}},
        ],
    })
    scripts.append({
        "id": "combo-di-ung-01",
        "group": "combo",
        "safety": True,
        "why": "Nhánh combo KHÔNG được là đường vòng qua bộ lọc dị nguyên.",
        "turns": [
            {"user": "mình dị ứng hải sản, cho 1 món chính 1 nước 1 tráng miệng",
             "expect": {"min_items": 2, "forbid_tags_any": ["allergen:seafood"],
                        "why": "CHỐT AN TOÀN. Mỗi suất lọc riêng, nhưng dị nguyên áp cho MỌI suất."}},
        ],
    })
    scripts.append({
        "id": "xung-dot-di-nguyen-01",
        "group": "combo",
        "safety": True,
        "why": ("Khách xin đúng thứ họ đang tránh. Hệ thống làm đúng về an toàn nhưng KHÔNG NÓI RA, "
                "nên khách tưởng nhà hàng hết món."),
        "turns": [
            {"user": "Con tôi không ăn được tôm hãy tư vấn món hải sản khác",
             "expect": {"forbid_tags_any": ["allergen:seafood"],
                        "must_say_any": ["cần tránh", "không lọc ra được"],
                        "why": "Phải giải thích vì sao không có món hải sản nào — thực đơn ghi nhãn "
                               "theo NHÓM, không tách riêng tôm."}},
            {"user": "tôi ăn được hải sản hãy tư vấn hải sản cho tôi",
             "expect": {"min_items": 3, "memory_must_not_have_avoid": ["allergen:seafood"],
                        "must_say_any": ["đã bỏ"],
                        "why": "LƯỢT BẮT LỖI: khách khẳng định mình ăn được thì phải gỡ được hàng "
                               "rào. Trước đây câu này trả 'chưa tìm được món nào' — ngõ cụt."}},
        ],
    })


    # ------------------------------------------------------------------------
    # Nhóm `rag_trong_phien` — nhánh TRUY HỒI chạy giữa một phiên có bộ nhớ.
    #
    # Vì sao nhóm này tồn tại. Trước nó, nhánh truy hồi toàn kho chạy **0/163
    # lượt** của tập phiên, và không ca nào đỏ — vì không tiêu chí nào hỏi tới
    # nó. Đường tri thức là đường duy nhất của hệ thống chưa từng được chứng
    # minh chạy trong một hội thoại thật, và "chưa ai hỏi" không phải "đã đúng".
    #
    # Mỗi kịch bản đặt câu tri thức Ở GIỮA phiên, sau một lời khai dị ứng. Nhờ
    # vậy nó đo hai thứ cùng lúc mà bộ một lượt không đo được:
    #
    #     1. truy hồi có chạy khi bộ nhớ đang giữ ràng buộc hay không
    #     2. ràng buộc dị nguyên có sống qua lượt tri thức hay không
    #
    # Điều 2 là chốt an toàn: một lượt tri thức đi đường khác hẳn nhánh lọc, nên
    # nếu bộ nhớ rơi ở đó thì lượt chọn món ngay sau sẽ mời món khách cần tránh.
    for i, (khai, nhan, cau_tri_thuc, phai_noi) in enumerate((
        ("Mình dị ứng hải sản nhé", "allergen:seafood",
         "Cùng là gà mà sao món thì mềm món thì dai?", "gà"),
        ("Nhà mình có người dị ứng đậu phộng", "allergen:peanut",
         "Uống cà phê buổi tối có bị mất ngủ không?", "cà phê"),
        ("Mình không ăn được sữa", "allergen:dairy",
         "Đồ chay ở đây có thật sự chay không?", "chay"),
    ), start=1):
        scripts.append({
            "id": f"rag-trong-phien-{i:02d}",
            "group": "rag_trong_phien",
            "why": ("Câu tri thức nằm GIỮA phiên, sau lời khai dị ứng. Đo hai thứ cùng lúc: "
                    "nhánh truy hồi có chạy khi bộ nhớ đang giữ ràng buộc, và ràng buộc có "
                    "sống qua lượt tri thức hay không."),
            "turns": [
                {"user": khai,
                 "expect": {"memory_must_have_avoid": [nhan],
                            "why": "Lời khai phải vào bộ nhớ ngay lượt này."}},
                {"user": "Có món nào không cay dưới 100k không?",
                 "expect": {"forbid_tags_any": [nhan], "min_items": 3,
                            "expect_branch_prefix": "filter",
                            "why": "Câu chọn món — đi nhánh lọc, và đã phải tránh dị nguyên."}},
                {"user": cau_tri_thuc,
                 "expect": {"expect_branch_prefix": "knowledge_corpus",
                            "must_say_any": [phai_noi],
                            "memory_must_have_avoid": [nhan],
                            "why": "LƯỢT THEN CHỐT. Câu này không tra bảng được nên phải đi "
                                   "TRUY HỒI, và bộ nhớ phải còn nguyên sau khi đi đường đó."}},
                {"user": "Vậy gợi ý mình vài món đi",
                 "expect": {"forbid_tags_any": [nhan], "min_items": 3,
                            "expect_branch_prefix": "filter",
                            "why": "Quay lại nhánh lọc sau lượt tri thức. Ràng buộc từ lượt 1 "
                                   "vẫn phải chặn — đây là chỗ bộ nhớ dễ rơi nhất, vì lượt "
                                   "trước đó đi một nhánh hoàn toàn khác."}},
            ],
        })

    return {
        "schema_version": 1,
        "authored": "Sinh bởi ai/scripts/build_session_scripts.py — đừng sửa tay tệp này.",
        "provenance": [
            "119 ca hiện có đều MỘT LƯỢT, nên chúng không đo được bộ nhớ phiên.",
            "",
            "Mỗi lượt kiểm HAI thứ: câu trả lời KHÔNG có món cấm, VÀ bộ nhớ CÒN giữ ràng buộc.",
            "Chỉ kiểm câu trả lời thì một hệ thống quên dị ứng nhưng tình cờ không gợi món hải sản",
            "cũng qua được.",
            "",
            "Nhóm `allergy_persists` là CHỐT AN TOÀN: một lượt mời món gây dị ứng là CHẶN.",
            "Nhóm `context_reference` có `aspirational: true` — được phép đỏ, đo khoảng cách còn",
            "lại. Đánh dấu rõ thay vì bỏ ca ra, vì bỏ ra thì báo cáo không nói được hệ thống thiếu",
            "gì.",
        ],
        "scripts": scripts,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Kiểm, không ghi.")
    args = parser.parse_args(argv)

    data = build()
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"

    import collections

    nhom = collections.Counter(s["group"] for s in data["scripts"])
    luot = sum(len(s["turns"]) for s in data["scripts"])
    aspir = sum(
        1 for s in data["scripts"] for t in s["turns"] if t["expect"].get("aspirational")
    )
    print(f"kịch bản  : {len(data['scripts'])}")
    print(f"lượt      : {luot}")
    print(f"aspirational: {aspir} lượt (được phép đỏ, đo khoảng cách còn lại)")
    print("theo nhóm : " + ", ".join(f"{k}={v}" for k, v in sorted(nhom.items())))

    if args.check:
        if not OUT_PATH.exists() or OUT_PATH.read_text(encoding="utf-8-sig") != text:
            print("\n--check: tệp khác kết quả sinh lại. Chạy lại script.")
            return 1
        print("\n--check: tệp khớp kết quả sinh lại.")
    else:
        OUT_PATH.write_text(text, encoding="utf-8")
        print(f"\nĐã ghi {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
