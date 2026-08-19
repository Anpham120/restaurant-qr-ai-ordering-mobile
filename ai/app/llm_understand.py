# -*- coding: utf-8 -*-
"""Dùng mô hình sinh để HIỂU câu hỏi, không để CHỌN món.

Vì sao chia vai như vậy
-----------------------
Bản cũ để mô hình quyết định nội dung câu trả lời, nên nó có thể mời khách một món gây dị
ứng hoặc bịa ra một giá. Ở đây mô hình chỉ làm đúng một việc: đọc câu khách thành **ràng
buộc**. Việc chọn món vẫn do mã tất định làm, trên đúng thực đơn.

Ba hệ quả, và cả ba đều là điều kiện để tin được:

1. **Mô hình không thể mời món gây dị ứng**, vì nó không chọn món.
2. **Mô hình không thể bịa giá**, vì giá lấy từ thực đơn.
3. **Mô hình không thể nới ràng buộc.** Kết quả của nó được **hợp** vào ràng buộc mã tất
   định đã tìm ra, không thay thế. Nên nếu mã đã thấy "dị ứng hải sản" thì mô hình có trả
   về gì cũng không xóa được ràng buộc đó. Đây là bất biến quan trọng nhất của tệp này, và
   có test riêng.

Mô hình chỉ được trả về **khóa nhãn có trong từ điển**. Khóa lạ bị bỏ, không phải bị tin.
Một mô hình bịa ra `flavour:umami` thì khóa đó rơi vào hư không thay vì làm hỏng bộ lọc.

Vì sao chỉ gọi khi cần
----------------------
Mã tất định đã trả lời được 80/80 ca trong phạm vi từ vựng của nó. Gọi mô hình cho những
câu đó là thêm độ trễ, thêm chi phí, và thêm một nguồn không tất định — mà không được gì.
Nên mô hình chỉ được gọi khi mã tất định **không hiểu đủ để lọc**, tức đúng lúc nó sắp
phải hỏi lại.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from understand import Request

REPO_ROOT = Path(__file__).resolve().parents[2]
DICT_PATH = REPO_ROOT / "data" / "menu-tags.json"
CACHE_PATH = Path(__file__).resolve().parent / "llm_cache.json"

# Nhóm nhãn mô hình được phép dùng làm ràng buộc CỨNG. Chỉ các nhóm phủ 91/91 món, hoặc
# nhóm mà khách nêu là nêu điều bắt buộc (chế độ ăn, dị nguyên).
HARD_GROUPS = ("spice", "price", "diet", "party", "season")

# Nhóm nhãn chỉ dùng để SẮP THỨ TỰ. Chúng không phủ hết 91 món nên thiếu nhãn nghĩa là
# *chưa ghi nhận*, không phải *không phù hợp* — dùng làm bộ lọc cứng sẽ cắt mất món đúng.
SOFT_GROUPS = ("flavour", "health", "occasion", "method", "ingredient", "region",
               "audience", "promo", "serving")

PROMPT = """Bạn đọc câu của khách trong nhà hàng Việt Nam và trả về ràng buộc dạng JSON.

Bạn KHÔNG chọn món và KHÔNG viết câu trả lời. Việc đó do phần khác làm.

Chỉ được dùng đúng các khóa nhãn trong danh sách dưới đây. Không được tự tạo khóa mới.

{vocabulary}

Trả về JSON đúng dạng này, không thêm chữ nào ngoài JSON:
{{"require": [], "prefer": [], "avoid": [], "wants": "food|drink|any"}}

- "require": nhãn khách nêu như điều BẮT BUỘC (độ cay, mức giá, chế độ ăn, số người).
- "prefer": nhãn chỉ là mong muốn hoặc ngữ cảnh (hương vị, sức khỏe, dịp ăn, cách chế biến).
- "avoid": nhãn dị nguyên khách nói không ăn được. Chỉ dùng nhóm allergen.
- "wants": "food" nếu khách nói về món ăn, "drink" nếu về đồ uống, "any" nếu không rõ.

Nếu câu của khách không nêu điều gì cụ thể, trả về mọi mảng rỗng và wants "any".
Không suy diễn quá xa: chỉ ghi điều khách thật sự nói.

Ví dụ:
Khách: "Cho mình gì đó chua chua"
{{"require": [], "prefer": ["flavour:sour"], "avoid": [], "wants": "any"}}

Khách: "Mình dị ứng tôm, muốn món không cay"
{{"require": ["spice:none"], "prefer": [], "avoid": ["allergen:seafood"], "wants": "any"}}

Khách: "Ừm không biết nữa"
{{"require": [], "prefer": [], "avoid": [], "wants": "any"}}
"""


@dataclass
class LlmOutcome:
    """Kết quả một lần gọi, đủ để giải thích và đo."""

    used: bool = False
    ok: bool = False
    reason: str = ""
    latency_ms: int = 0
    added_require: list[str] = None  # type: ignore[assignment]
    added_prefer: list[str] = None   # type: ignore[assignment]
    added_avoid: list[str] = None    # type: ignore[assignment]
    dropped: list[str] = None        # type: ignore[assignment]

    def __post_init__(self) -> None:
        for name in ("added_require", "added_prefer", "added_avoid", "dropped"):
            if getattr(self, name) is None:
                setattr(self, name, [])


# Các khóa cấu hình được đọc từ biến môi trường của tiến trình nếu có.
ENV_KEYS = (
    "LLM_MODEL",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_TIMEOUT_SECONDS",
)


def load_env(path: Path | None = None) -> dict[str, str]:
    """Cấu hình mô hình: tệp `ai/.env` làm nền, biến môi trường ghi đè lên.

    Đọc cả biến môi trường là bắt buộc, vì hai lý do:

    1. **Dịch vụ chạy thật lấy cấu hình từ biến môi trường**, không từ tệp trong repo —
       `ai/.env` chứa khóa nên bị gitignore.
    2. **CI cần `LLM_MODEL` để dùng được cache.** Khóa cache gồm tên mô hình, nên không có
       tên mô hình thì mọi lần tra cache đều trượt, và cache đã commit trở thành vô dụng.
       Đó chính là điều đã xảy ra: CI đọc được cache nhưng không khớp khóa nào. Tên mô hình
       không phải bí mật nên CI khai trực tiếp được.
    """
    out: dict[str, str] = {}
    env_path = path or (REPO_ROOT / "ai" / ".env")
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            out[key.strip()] = value.strip()
    for key in ENV_KEYS:
        value = os.environ.get(key)
        # `is not None` chứ KHÔNG kèm `and value.strip()`: biến CÓ MẶT nhưng RỖNG phải ghi đè tệp
        # thành rỗng, không được lặng lẽ nhường lại cho tệp.
        #
        # Bản đầu viết `if value is not None and value.strip()`, tức `LLM_API_KEY=` (rỗng, đặt có
        # chủ đích) bị BỎ QUA và giá trị trong `ai/.env` thắng. Hai hậu quả:
        #
        #   1. Người vận hành muốn TẮT mô hình bằng cách đặt khóa rỗng thì không tắt được, và
        #      `/ready` báo `model_configured: true`. Đây đúng lớp lỗi với quy tắc
        #      `AI_INTERNAL_TOKEN` rỗng phải CHẶN mọi request: rỗng nghĩa là rỗng.
        #   2. `test_model_configured_PHAI_kiem_ca_khoa` chỉ XANH ở nơi KHÔNG có `ai/.env` — tức
        #      xanh trên CI và đỏ trên mọi máy có khóa thật. Một test phụ thuộc môi trường như vậy
        #      không kiểm được điều nó nói mình kiểm; nó chỉ chưa gặp môi trường làm nó đỏ.
        #
        # Vẫn `.strip()` giá trị, nên `LLM_API_KEY="   "` cũng thành rỗng — khoảng trắng không phải
        # một khóa.
        if value is not None:
            out[key] = value.strip()
    return out


def build_vocabulary() -> tuple[str, dict[str, str]]:
    """Danh sách nhãn cho mô hình đọc, và bảng tra khóa -> nhóm để kiểm đầu ra."""
    data = json.loads(DICT_PATH.read_text(encoding="utf-8-sig"))
    groups: dict[str, list[str]] = {}
    key_group: dict[str, str] = {}
    for key, entry in data["tags"].items():
        groups.setdefault(entry["group"], []).append(f"{key} = {entry['label_vi']}")
        key_group[key] = entry["group"]
    lines = []
    for group in sorted(groups):
        lines.append(f"Nhóm {group}: " + "; ".join(sorted(groups[group])))
    return "\n".join(lines), key_group


_CACHE: dict[str, dict] | None = None


def _cache() -> dict[str, dict]:
    global _CACHE
    if _CACHE is None:
        if CACHE_PATH.exists():
            _CACHE = json.loads(CACHE_PATH.read_text(encoding="utf-8-sig"))
        else:
            _CACHE = {}
    return _CACHE


def _cache_key(question: str, model: str) -> str:
    return hashlib.sha256(f"{model}\n{question}".encode()).hexdigest()[:32]


def _save_cache() -> None:
    if _CACHE is not None:
        CACHE_PATH.write_text(
            json.dumps(_CACHE, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


def call_model(
    question: str,
    env: dict[str, str],
    *,
    use_cache: bool = True,
    prompt: str | None = None,
    nhan: str = "",
    max_tokens: int = 300,
) -> dict | None:
    """Gọi mô hình, trả về JSON đã phân tích hoặc None nếu thất bại.

    Có cache trên đĩa vì mô hình sinh **không tất định**, mà cả dự án này dựa trên tính
    chất "chạy lại cho cùng kết quả". Cache làm phép đo tái lập được; xóa tệp cache là đo
    lại từ đầu.

    `prompt` và `nhan` cho phép dùng lại toàn bộ phần gọi mạng cho một CÔNG VIỆC KHÁC —
    hiện là lớp đọc ý định (`intent.doc_y_dinh_bang_mo_hinh`). Hai tham số phải đi cùng nhau:

        prompt   câu hệ thống khác  -> câu trả lời khác
        nhan     KHÔNG GIAN cache   -> hai công việc không đọc nhầm kết quả của nhau

    `nhan` rỗng giữ NGUYÊN khóa cache cũ, có chủ ý: cache đã commit là thứ CI dựa vào để
    chạy không cần mạng, nên đổi cách tính khóa là làm mọi mục đã lưu thành vô dụng và
    làm CI đỏ vì một lý do không liên quan gì tới thay đổi.
    """
    model = env.get("LLM_MODEL", "")
    key = _cache_key(f"{nhan}::{question}" if nhan else question, model)
    if use_cache and key in _cache():
        return _cache()[key]

    # Thiếu cấu hình thì KHÔNG thử gọi. Đây là trạng thái bình thường ở CI: `ai/.env` chứa
    # khóa nên bị gitignore, tức CI không bao giờ có cấu hình mô hình.
    #
    # Bản đầu không có phép kiểm này, và `urllib.request.Request(...)` lại nằm NGOÀI khối
    # try — nên URL rỗng thành "/chat/completions" và ném `ValueError: unknown url type`,
    # làm sập cả bước CI. Tức lời khẳng định "gọi thất bại thì giữ nguyên câu trả lời tất
    # định" là SAI ở đúng trường hợp hay xảy ra nhất. CI tìm ra vì CI là nơi duy nhất không
    # có tệp cấu hình.
    base_url = env.get("LLM_BASE_URL", "").strip()
    if not base_url or not env.get("LLM_API_KEY", "").strip() or not model:
        return None

    if prompt is None:
        vocabulary, _ = build_vocabulary()
        prompt = PROMPT.format(vocabulary=vocabulary)
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": question},
            ],
            "temperature": 0,
            "max_tokens": max_tokens,
        }
    ).encode()
    # Toàn bộ phần gọi mạng nằm TRONG try, kể cả việc dựng Request — dựng Request cũng ném
    # được lỗi, và ném ở ngoài try thì không có gì bắt.
    try:
        request = urllib.request.Request(
            base_url.rstrip("/") + "/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {env['LLM_API_KEY'].strip()}",
            },
        )
        timeout = float(env.get("LLM_TIMEOUT_SECONDS", "30"))
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
        content = payload["choices"][0]["message"]["content"]
    except (urllib.error.URLError, OSError, KeyError, ValueError, TypeError, TimeoutError):
        return None

    # Mô hình hay bọc JSON trong ```json ... ``` — lấy khối ngoặc nhọn đầu tiên.
    match = re.search(r"\{.*\}", content, re.S)
    if match is None:
        return None
    try:
        parsed = json.loads(match.group(0))
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    # Ghi cache dù `use_cache=False`. `--no-cache` nghĩa là "đừng ĐỌC bản đã lưu", không
    # phải "đừng ghi lại" — bản đầu hiểu sai điều này, nên lần đo `--no-cache` không lưu câu
    # trả lời cho 5 câu hỏi mới, và CI (chạy trên cache, không có mạng) thiếu đúng chúng.
    _cache()[key] = parsed
    _save_cache()
    return parsed


def enrich(request: Request, env: dict[str, str], *, use_cache: bool = True) -> LlmOutcome:
    """Thêm ràng buộc mô hình đọc được vào `request`, tại chỗ.

    Chỉ gọi mô hình khi mã tất định chưa hiểu đủ để lọc. Và chỉ **thêm** — không xóa gì.
    """
    outcome = LlmOutcome()

    # Mọi tín hiệu cho thấy mã tất định ĐÃ hiểu câu hỏi. Thiếu một tín hiệu ở đây là gọi
    # mô hình vào chỗ không cần, và mô hình có thể làm hỏng câu trả lời đang đúng — đúng
    # điều đã xảy ra: bản đầu thiếu `asks_extreme`, nên câu "Món đắt nhất menu là món nào?"
    # bị gọi mô hình rồi tụt, dù mã tất định trả lời đúng.
    already_understood = bool(
        request.require_tags
        or request.prefer_tags
        or request.avoid_tags
        or request.categories
        or request.budget_max is not None
        or request.named_items
        or request.policy_topic
        # `knowledge_topic` vắng mặt ở đây suốt một thời gian, và nó là một lỗ thật: mã tất định đã
        # nhận ra chủ đề tri thức, nhưng mô hình vẫn được gọi và vẫn thêm được nhãn lọc — nhãn đó đẩy
        # câu sang nhánh lọc, tức chủ đề đã nhận ra bị bỏ.
        #
        # Đối xứng với `policy_topic` ngay trên: hai trường này là cùng một loại tín hiệu ("đã biết
        # câu này hỏi về chủ đề nào"), nên có một mà thiếu một là bỏ sót, không phải lựa chọn.
        or request.knowledge_topic
        or request.off_topic
        or request.unknown_item
        or request.asks_price
        or request.asks_extreme is not None
        or request.is_comparison
        or request.asks_allergy
        # Câu HỎI VỀ một thuộc tính. Đây là tín hiệu thứ mười bốn, và nó vào danh sách vì golden qua
        # stack thật bắt được hai lượt mà mã tất định định tuyến ĐÚNG rồi mô hình làm sai:
        #
        #     "Nhãn 'ít calo' dựa trên gì?"   mô hình trả `prefer: health:low_calorie` -> filter
        #     "Món này có bột ngọt không?"    mô hình trả `prefer: health:no_msg`      -> filter
        #
        # Khách nhận về "Mời bạn tham khảo: Cơm chiên chay ngũ sắc (50.000đ), …" cho một câu hỏi
        # có/không về một món cụ thể — sai loại câu trả lời, kèm thẻ giỏ cho câu không hỏi mua gì.
        #
        # Cùng lớp với `asks_extreme` ở trên: mã tất định trả lời đúng, mô hình được gọi vào chỗ không
        # cần, và nó làm tụt. Mỗi lần thêm một tín hiệu vào đây là một lần trả giá bằng một ca đỏ.
        or request.asks_about_attribute
    )
    # Chú ý KHÔNG có `request.wants` ở danh sách trên. Biết khách "muốn món ăn" chỉ thu hẹp
    # còn 56/91 món — gần như không phải bộ lọc, nên nó KHÔNG đủ để coi là đã hiểu câu hỏi.
    #
    # Bản đầu tính `wants` vào đây, và câu "Trời nóng quá, ăn gì cho mát người" bị chặn vì
    # chữ "ăn gì" đặt wants=food. Mô hình đọc được nhãn mùa cho câu đó, nhưng không bao giờ
    # được gọi để nói ra. (Câu đó nay đã có trong từ vựng nên mã tất định trả lời được, không
    # cần mô hình — nhưng lý do loại `wants` khỏi danh sách vẫn đúng: biết khách muốn món ăn
    # chỉ thu hẹp còn 56/91 món, chưa đủ để coi là đã hiểu câu hỏi.)
    # Ngoại lệ, và là ngoại lệ vì lý do an toàn: khách đã nêu một hạn chế mà mã tất định
    # không hiểu là hạn chế gì. Lúc đó "đã hiểu đủ" là ảo — hệ thống hiểu phần khác của
    # câu nhưng bỏ sót đúng phần quan trọng nhất.
    #
    # Bản đầu của tôi không có ngoại lệ này, nên câu "Mình không ăn được đồ tanh, gợi ý
    # món ăn giúp mình" bị coi là đã hiểu (vì thấy "món ăn") và mô hình không được gọi —
    # để lại một lỗi an toàn mà chính mô hình đã sửa được ở lần đo trước.
    if already_understood and not request.unparsed_restriction:
        outcome.reason = "mã tất định đã hiểu đủ, không cần gọi mô hình"
        return outcome

    outcome.used = True
    started = time.time()
    parsed = call_model(request.text, env, use_cache=use_cache)
    outcome.latency_ms = int((time.time() - started) * 1000)
    if parsed is None:
        outcome.reason = "gọi mô hình thất bại — giữ nguyên câu trả lời tất định"
        return outcome

    _, key_group = build_vocabulary()

    def tags_in(field: str) -> list[tuple[str, str]]:
        """Các khóa hợp lệ mô hình đặt trong một trường, kèm nhóm của chúng.

        MỌI dữ liệu từ mô hình phải đi qua đây. Bản đầu của tôi dùng hàm kiểm cho
        `require`/`prefer` nhưng viết list comprehension trần cho `avoid` — nên mô hình trả
        về `"avoid": 42` là **sập dịch vụ** (`'int' object is not iterable`), và khóa bịa
        trong `avoid` bị bỏ im lặng không ghi lại. Một cửa duy nhất thì không có chỗ nào
        thiếu phòng vệ.
        """
        values = parsed.get(field)
        out: list[tuple[str, str]] = []
        if not isinstance(values, list):
            if values is not None:
                outcome.dropped.append(f"{field}={values!r} (không phải danh sách)")
            return out
        for value in values:
            if not isinstance(value, str):
                outcome.dropped.append(f"{value!r} (không phải chuỗi)")
                continue
            group = key_group.get(value)
            if group is None:
                # Mô hình bịa ra khóa không có trong từ điển. Bỏ, không tin.
                outcome.dropped.append(value)
                continue
            out.append((value, group))
        return out

    # Nhóm nhãn quyết định vai, KHÔNG phải mô hình. Mô hình xếp sai vai vẫn là thông tin
    # thật, nên chuyển vai chứ không bỏ:
    #   nhóm mềm  -> chỉ dùng để sắp thứ tự (không cắt mất món đúng, vì nhóm không phủ hết)
    #   nhóm cứng -> dùng làm bộ lọc (nhóm phủ 91/91 nên lọc được dứt khoát)
    hard: list[str] = []
    soft: list[str] = []
    for field in ("require", "prefer"):
        for value, group in tags_in(field):
            target = hard if group in HARD_GROUPS else soft if group in SOFT_GROUPS else None
            if target is None:
                outcome.dropped.append(f"{value} (nhóm {group} không dùng làm ràng buộc)")
                continue
            if group in HARD_GROUPS and field == "prefer":
                outcome.dropped.append(f"{value} (nâng lên ràng buộc cứng)")
            elif group in SOFT_GROUPS and field == "require":
                outcome.dropped.append(f"{value} (hạ xuống sắp thứ tự)")
            if value not in target:
                target.append(value)

    # `avoid` chỉ nhận nhóm allergen. Một nhãn thật nhưng không phải dị nguyên đặt ở đây
    # sẽ khiến hệ thống loại món vì lý do sai, nên nó bị bỏ.
    avoid: list[str] = []
    for value, group in tags_in("avoid"):
        if group != "allergen":
            outcome.dropped.append(f"{value} (không phải dị nguyên, không được dùng để loại)")
        elif value not in avoid:
            avoid.append(value)

    for tag in hard:
        if tag not in request.require_tags:
            request.require_tags.append(tag)
            outcome.added_require.append(tag)
    for tag in soft:
        if tag not in request.prefer_tags and tag not in request.require_tags:
            request.prefer_tags.append(tag)
            outcome.added_prefer.append(tag)
    for tag in avoid:
        if tag not in request.avoid_tags:
            request.avoid_tags.append(tag)
            request.asks_allergy = True
            outcome.added_avoid.append(tag)

    wants = parsed.get("wants")
    if request.wants == "any" and wants in ("food", "drink"):
        request.wants = wants
        # Ghi lại rằng `wants` này do MÔ HÌNH ĐOÁN, không phải khách nói.
        #
        # Vì sao phải phân biệt: `wants` một mình là ràng buộc yếu (thu 56/91 hoặc 21/91 món),
        # nhưng nó ĐỦ để `answer.py` thôi hỏi lại. Nên khi mô hình đoán `wants` cho một câu hoàn
        # toàn mơ hồ, hệ thống chuyển từ "hỏi lại" sang "liệt kê 6 món tùy ý" — và trả lời tự tin
        # bằng một phỏng đoán tệ hơn là nói không biết.
        #
        # Đo được: câu "Cho mình 2 món" (chỉ nêu SỐ LƯỢNG, không nêu loại) — mã tất định hỏi lại
        # đúng, còn mô hình trả `wants: food` và hệ thống liệt kê 6 món ăn bất kỳ. Đây là ca DUY
        # NHẤT mô hình làm TỤT trong 122 ca, và nó chỉ lộ ra khi thước đo bắt đầu chấm thẻ giỏ.
        #
        # KHÔNG bỏ hẳn `wants` của mô hình: nó vẫn hữu ích để LỌC khi có ràng buộc khác đi cùng
        # ("cho mình gì đó chua chua" + wants=food). Chỉ chặn đúng một chuyện: nó không được một
        # mình thay lời khách để tắt câu hỏi lại.
        request.wants_from_model = True

    outcome.ok = True
    outcome.reason = "mô hình đọc được ràng buộc"
    return outcome
