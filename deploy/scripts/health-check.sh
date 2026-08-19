#!/usr/bin/env bash
# Phép kiểm sau deploy: dịch vụ vừa dựng có ĐANG phục vụ đúng cấu hình đã đo không.
#
# Vì sao tệp này phải viết lại
# ----------------------------
# Bản trước assert theo hợp đồng của hệ thống AI CŨ: `pipeline_profile`, `model_policy`,
# `provider_status`, `model_attempts`, `verifier_result`, `resolved_menu_item_ids`, `evidence`,
# `claims`.  Bản dựng lại không trả trường nào trong số đó, nên phép kiểm đỏ **trong khi dịch vụ
# hoàn toàn khỏe** — lần chạy 2026-07-31 in ra đúng `/ready` mong đợi rồi vẫn thất bại:
#
#     retriever=embedding · retriever_vectors_from_cache=True · generation_enabled=False
#     menu_items=91 · knowledge_chunks=449          <- tất cả đều đúng
#     AssertionError                                <- vì phép kiểm hỏi trường của hệ cũ
#
# Đây là lần thứ tám trong dự án này một bất biến "hai đầu phải khớp" chỉ được sửa ở MỘT đầu, và đầu
# thứ hai lại viết bằng ngôn ngữ khác — ở đây là Python nội tuyến trong Bash.  Nên phép kiểm mới
# **không viết tay kỳ vọng nào**: nó lấy `retriever` và `generation` mong đợi từ chính hàm mà cổng
# deploy dùng (`ai/evaluation/verify_deploy_config.py`), tức từ `requirements.txt` và biến môi
# trường thật.  Không có số nào ở đây để trôi.
#
# Điều phép kiểm này cố ý KHÔNG làm
# ---------------------------------
# Không chạy lại bộ golden.  Golden cần cả stack và một khóa mô hình thật; nó đã chạy ở CI trước
# khi deploy, và `verify_deploy_config.py` đối chiếu cấu hình sắp deploy với bằng chứng đó.  Việc
# của tệp này là hỏi câu khác: **dịch vụ ĐANG CHẠY có đúng là cấu hình ấy không.**
set -euo pipefail

: "${DEPLOY_ENV:?DEPLOY_ENV is required}"
: "${FRONTEND_SERVER_NAMES:?FRONTEND_SERVER_NAMES is required}"
: "${API_SERVER_NAME:?API_SERVER_NAME is required}"
: "${AI_INTERNAL_TOKEN:?AI_INTERNAL_TOKEN is required}"
: "${LLM_MODEL:?LLM_MODEL is required}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

primary_frontend_domain="$(printf '%s\n' "$FRONTEND_SERVER_NAMES" | awk '{print $1}')"
frontend_url="${FRONTEND_HEALTH_URL:-https://${primary_frontend_domain}/}"
api_health_url="${API_HEALTH_URL:-https://${API_SERVER_NAME}/api/health}"
api_ready_url="${API_READY_URL:-https://${API_SERVER_NAME}/health/ready}"
ai_ready_url="${AI_READY_URL:-http://127.0.0.1:${AI_SERVICE_PORT:-8001}/ready}"
ai_chat_url="${AI_CHAT_URL:-http://127.0.0.1:${AI_SERVICE_PORT:-8001}/v1/chat}"
api_chat_sessions_url="${API_CHAT_SESSIONS_URL:-https://${API_SERVER_NAME}/api/chat/sessions}"

echo "Checking frontend: ${frontend_url}"
curl --fail --show-error --silent --retry 10 --retry-delay 5 --retry-all-errors "$frontend_url" >/dev/null

echo "Checking API health: ${api_health_url}"
curl --fail --show-error --silent --retry 10 --retry-delay 5 --retry-all-errors "$api_health_url"

echo "Checking API readiness (database and AI dependency): ${api_ready_url}"
curl --fail --show-error --silent --retry 10 --retry-delay 5 --retry-all-errors "$api_ready_url"

# Kỳ vọng lấy từ mã, không viết tay.  `bo_truy_hoi_se_deploy()` đọc `requirements.txt` vì bộ truy hồi
# do NỘI DUNG ẢNH quyết định, không do biến môi trường; `duong_sinh_se_bat()` đọc đúng biến mà
# `service._bat_duong_sinh` đọc.  Cả hai chỉ dùng thư viện chuẩn nên python3 hệ thống chạy được.
expectations="$(cd "$repo_root" && python3 - <<'PY'
import sys
sys.path.insert(0, "ai/evaluation")
import verify_deploy_config as gate

print(gate.bo_truy_hoi_se_deploy())
print("true" if gate.duong_sinh_se_bat() else "false")
PY
)"
expected_retriever="$(printf '%s\n' "$expectations" | sed -n '1p')"
expected_generation="$(printf '%s\n' "$expectations" | sed -n '2p')"
echo "Expecting retriever=${expected_retriever} generation_enabled=${expected_generation} (derived from the repo, not hard-coded)"

echo "Checking AI readiness: ${ai_ready_url}"
probe_dir="$(mktemp -d)"
trap 'rm -rf "$probe_dir"' EXIT
ready_payload="${probe_dir}/ready.json"
curl --fail --show-error --silent --retry 10 --retry-delay 5 --retry-all-errors \
  "$ai_ready_url" > "$ready_payload"
python3 - "$ready_payload" "$LLM_MODEL" "$expected_retriever" "$expected_generation" <<'PY'
import json
import sys

payload = json.load(open(sys.argv[1], encoding="utf-8"))
expected_model, expected_retriever = sys.argv[2], sys.argv[3]
expected_generation = sys.argv[4].strip().lower() == "true"

assert payload.get("ready") is True, payload

# Con số, không chỉ `true/false`.  Một dịch vụ báo `ready: true` với 0 món hoặc 0 đoạn tri thức là
# dịch vụ sẽ trả "chưa có dữ liệu" cho mọi câu — và đó đúng là lỗi đã xảy ra một lần: kho tri thức
# nằm ngoài phạm vi COPY của Dockerfile, container im lặng phục vụ với kho rỗng.
assert payload.get("menu_error") is None, payload
assert int(payload.get("menu_items") or 0) > 0, payload
assert int(payload.get("knowledge_chunks") or 0) > 0, payload
assert int(payload.get("verbatim_topics") or 0) > 0, payload

# Mô hình: PHẢI gồm cả khóa.  Bản trước chỉ kiểm URL và tên, nên một container chạy với
# `LLM_API_KEY=` rỗng vẫn báo cấu hình đủ, và một phép đo đầu-cuối đã bị kết luận sai là "có mô
# hình thật" trong khi mọi lượt đi đường tất định.
assert str(payload.get("model") or "") == expected_model, payload
assert payload.get("model_base_url_set") is True, payload
assert payload.get("model_key_set") is True, payload
assert payload.get("model_configured") is True, payload

# Cấu hình đang chạy phải khớp cấu hình đã ĐO.  `verify_deploy_config.py` đã chặn ở CI nếu bằng
# chứng không khớp thứ sắp deploy; đây là đầu còn lại — thứ THẬT SỰ đang chạy.
assert payload.get("retriever") == expected_retriever, payload
assert bool(payload.get("generation_enabled")) is expected_generation, payload

if expected_retriever == "embedding":
    assert int(payload.get("retriever_chunks") or 0) > 0, payload
    # Đệm vector trượt là một hồi quy THẬT dù không câu nào trả lời sai: khởi động 61,9s thay vì
    # 19,0s, mỗi lần khởi động lại.  Nó từng trượt im lặng suốt một giai đoạn (đệm ghi theo 425
    # đoạn, chạy theo 370) trong khi log báo thành công.
    assert payload.get("retriever_vectors_from_cache") is True, payload
PY

echo "Running protected basic AI smoke request"
curl --fail --show-error --silent --retry 2 --retry-delay 2 --retry-all-errors \
  -H "Authorization: Bearer ${AI_INTERNAL_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"message":"Xin chào"}' \
  "$ai_chat_url" >/dev/null

menu_dataset="/opt/cmc-restaurant/${DEPLOY_ENV}/repo/data/menu-dataset.json"
run_semantic_probe() {
  local probe_name="$1"
  local probe_message="$2"
  local request_file="${probe_dir}/${probe_name}-request.json"
  local response_file="${probe_dir}/${probe_name}-response.json"

  python3 - "$menu_dataset" "$request_file" "$probe_message" "$probe_name" <<'PY'
import json
import sys

source, target, message, probe_name = sys.argv[1:5]
raw = json.load(open(source, encoding="utf-8-sig"))
menu_items = [
    {
        "id": item["id"],
        "name": item["name"],
        "description": item.get("description") or "",
        "category_id": item.get("categoryId") or "",
        "category_name": item.get("categoryName") or "",
        "price_vnd": item.get("price"),
        "tags": item.get("tags") or [],
        "is_available": bool(item.get("isAvailable", True)),
    }
    for item in raw["items"]
]
payload = {
    "contract_version": "v2",
    "message": message,
    "session_id": f"deploy-smoke-{probe_name}",
    "session_state": {
        "facts": [],
        "constraints": {},
        "memory_version": "v3",
        "conversation_frame": {"turn_sequence": 0},
    },
    "live_context": {
        "menu_items": menu_items,
        "table_code": "SMOKE",
    },
}
with open(target, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False)
PY

  curl --fail --show-error --silent --retry 2 --retry-delay 2 --retry-all-errors \
    -H "Authorization: Bearer ${AI_INTERNAL_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@${request_file}" \
    "$ai_chat_url" > "$response_file"

  python3 - "$response_file" "$menu_dataset" "$probe_name" <<'PY'
import json
import sys
import unicodedata

payload = json.load(open(sys.argv[1], encoding="utf-8"))
menu_source, probe_name = sys.argv[2:4]
content = str(payload.get("content") or "")
decision = dict(payload.get("decision") or {})

assert payload.get("ok") is True, payload
assert payload.get("provider_available") is True, payload
assert content.strip(), payload
assert isinstance(payload.get("guardrail_flags"), list), payload

# Ba câu thử đều hỏi về món CÓ trong thực đơn, nên từ chối là sai.  Câu từ chối của hệ thống là một
# câu cố định và đã có test bảo vệ nguyên văn; kiểm nó ở đây là kiểm dịch vụ đang thấy dữ liệu.
assert decision.get("kind") not in ("no_data", "refuse"), payload
# `chưa có dữ liệu` là phần chung của mọi biến thể câu từ chối ("Mình chưa có dữ liệu về việc này
# ạ."), nên cấm đúng phần đó thay vì gõ lại nguyên câu — nguyên câu đổi một chữ là phép kiểm chết.
# `ai/app/test_deploy_health_check.py` đối chiếu danh sách này với câu từ chối THẬT của dịch vụ.
for forbidden_phrase in (
    "chưa có dữ liệu",
    "hệ thống hơi chậm",
):
    assert forbidden_phrase not in content.casefold(), payload

# Mô hình được gọi thì phải gọi ĐƯỢC.  Không đòi nó phải được gọi: một câu mà từ vựng tất định đã
# hiểu trọn thì bỏ qua lần gọi là đúng thiết kế, không phải thiếu sót.  Nhưng "gọi rồi lỗi, âm thầm
# rơi về đường tất định" thì phải đỏ, vì bề ngoài hai trường hợp giống nhau.
model = dict(decision.get("model") or {})
if model.get("used") is True:
    assert model.get("ok") is True, payload

# Bất biến quan trọng nhất của phản hồi: MỌI thẻ giỏ phải trỏ vào món CÓ THẬT trong thực đơn vừa
# gửi, với đúng giá của nó, và luôn cần khách xác nhận.  Đây là ranh giới "AI không tự đặt món".
raw_menu = json.load(open(menu_source, encoding="utf-8-sig"))
by_id = {str(item.get("id") or "").strip(): item for item in raw_menu.get("items") or []}
actions = payload.get("suggested_cart_actions") or []
for action in actions:
    item_id = str(action.get("menu_item_id") or "").strip()
    assert item_id in by_id, (action, payload)
    assert action.get("requires_customer_confirmation") is True, (action, payload)
    assert int(action.get("price") or 0) == int(by_id[item_id].get("price") or 0), (action, payload)

if probe_name.startswith("pho"):
    def normalize_text(value):
        decomposed = unicodedata.normalize("NFD", str(value or "")).casefold()
        return "".join(char for char in decomposed if not unicodedata.combining(char))

    pho_allowed_ids = {
        str(item.get("id") or "").strip()
        for item in raw_menu.get("items") or []
        if "pho" in normalize_text(item.get("name"))
    }
    assert pho_allowed_ids, raw_menu
    action_ids = {str(action.get("menu_item_id") or "").strip() for action in actions}
    assert action_ids, payload
    assert action_ids.issubset(pho_allowed_ids), payload
PY
}

echo "Running protected semantic AI smoke probes"
run_semantic_probe "pho-list" "Nhà hàng mình có những món phở gì nhỉ?"
run_semantic_probe "pho-recommend" "Gợi ý cho mình món phở tại nhà hàng đi"
run_semantic_probe "nhau" "Mình có món nhậu không?"

# Mô hình có GỌI ĐƯỢC không — một lần gọi THẬT, không phải đọc lại cấu hình.
#
# Vì sao bước này phải tồn tại: `/ready` báo `model_configured: true` khi có đủ URL, tên mô hình và
# khóa. Ba thứ đó là ĐÃ CẤU HÌNH, không phải GỌI ĐƯỢC — và khoảng cách đó vừa nuốt trọn một tính
# năng mà không có gì báo:
#
#     staging  0,5–1,0s, câu khuôn mẫu     mọi lần gọi thất bại rồi âm thầm rơi về đường tất định
#     cục bộ   5,5–9,6s, câu sinh tự nhiên  cùng mã, cùng câu hỏi
#
# `/ready` xanh, health check xanh, golden 103/103 — golden chạy được KHÔNG cần mô hình, có chủ ý.
# Nên không phép kiểm nào trong dự án nhìn thấy chuyện này. Bước dưới đây là phép kiểm đó.
#
# FAIL CLOSED: mô hình đã cấu hình mà gọi không được là CHẶN deploy. Một dịch vụ chạy với lớp mô
# hình nằm im nhưng vẫn báo khỏe là thứ tệ hơn một deploy đỏ — deploy đỏ thì có người sửa.
#
# Chỉ chặn khi ĐÃ cấu hình. Môi trường cố ý không có mô hình (CI) thì `configured=false` và bước này
# chỉ ghi chú, không chặn.
echo "Checking AI model REACHABILITY (one real call)"
model_check_file="${probe_dir}/model-check.json"
curl --fail --show-error --silent --retry 2 --retry-delay 3 --retry-all-errors \
  -H "Authorization: Bearer ${AI_INTERNAL_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{}' \
  "${AI_MODEL_CHECK_URL:-http://127.0.0.1:${AI_SERVICE_PORT:-8001}/v1/model-check}" \
  > "$model_check_file"
python3 - "$model_check_file" <<'PY'
import json
import sys

payload = json.load(open(sys.argv[1], encoding="utf-8"))

if not payload.get("configured"):
    print(f"  mô hình KHÔNG được cấu hình ({payload.get('reason')}) — bỏ qua phép kiểm gọi được.")
    print("  Dịch vụ vẫn trả lời bằng đường tất định; đường sinh và lớp đọc ý định sẽ nằm im.")
    raise SystemExit(0)

assert payload.get("ok") is True, (
    "MÔ HÌNH ĐÃ CẤU HÌNH NHƯNG GỌI KHÔNG ĐƯỢC.\n"
    f"  lý do    : {payload.get('reason')}\n"
    f"  độ trễ   : {payload.get('latency_ms')}ms\n"
    "  Hậu quả: mọi lượt rơi về đường tất định, IM LẶNG — `/ready` vẫn xanh, golden vẫn 103/103.\n"
    "  Kiểm `LLM_BASE_URL` có trỏ vào một dịch vụ ĐANG CHẠY không."
)
print(f"  mô hình gọi được: {payload.get('model')} · {payload.get('latency_ms')}ms")
PY

echo "Running backend-integrated AI smoke request"
backend_session_request="${probe_dir}/backend-session-request.json"
backend_session_response="${probe_dir}/backend-session-response.json"
backend_message_request="${probe_dir}/backend-message-request.json"
backend_stream_response="${probe_dir}/backend-stream-response.txt"
printf '{}\n' > "$backend_session_request"
curl --fail --show-error --silent --retry 2 --retry-delay 2 --retry-all-errors \
  -H "Content-Type: application/json" \
  --data-binary "@${backend_session_request}" \
  "$api_chat_sessions_url" > "$backend_session_response"

python3 - "$backend_session_response" "${probe_dir}/backend-session-id.txt" "${probe_dir}/backend-session-token.txt" <<'PY'
import json
import sys

source, session_target, token_target = sys.argv[1:4]
payload = json.load(open(source, encoding="utf-8"))
session_id = str(payload.get("chatSessionId") or "").strip()
access_token = str(payload.get("accessToken") or "").strip()
assert session_id, payload
assert access_token, payload
open(session_target, "w", encoding="utf-8").write(session_id)
open(token_target, "w", encoding="utf-8").write(access_token)
PY

python3 - "$backend_message_request" <<'PY'
import json
import sys

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump({"content": "Ở đây có phở không"}, handle, ensure_ascii=False)
PY

backend_session_id="$(cat "${probe_dir}/backend-session-id.txt")"
backend_session_token="$(cat "${probe_dir}/backend-session-token.txt")"
curl --fail --show-error --silent --retry 2 --retry-delay 2 --retry-all-errors \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Accept: text/event-stream" \
  -H "X-Chat-Session-Token: ${backend_session_token}" \
  --data-binary "@${backend_message_request}" \
  "${api_chat_sessions_url}/${backend_session_id}/messages/stream" > "$backend_stream_response"

python3 - "$backend_stream_response" <<'PY'
import json
import sys

event_name = ""
final_payload = None
for raw_line in open(sys.argv[1], encoding="utf-8"):
    line = raw_line.rstrip("\r\n")
    if line.startswith("event: "):
        event_name = line[7:].strip()
    elif line.startswith("data: ") and event_name == "final":
        final_payload = json.loads(line[6:])
        event_name = ""

assert final_payload is not None, "Backend AI stream did not emit a final event"
message = final_payload.get("message") or {}
content = str(message.get("content") or "").strip()
flags = {str(flag) for flag in final_payload.get("guardrailFlags") or []}
forbidden_flags = {"AI_PROVIDER_UNAVAILABLE", "AI_UPSTREAM_CONTRACT_ERROR"}
assert content, final_payload
assert not flags.intersection(forbidden_flags), final_payload
assert "hệ thống hơi chậm" not in content.casefold(), final_payload
assert "phở" in content.casefold(), final_payload
PY

report_dir="/opt/cmc-restaurant/${DEPLOY_ENV}/reports"
mkdir -p "$report_dir"
compose_file="/opt/cmc-restaurant/${DEPLOY_ENV}/repo/deploy/docker-compose.yml"
compose_status="not checked"
if [ -f "$compose_file" ] && [ -n "${COMPOSE_PROJECT_NAME:-}" ]; then
  compose_status="$(docker compose --env-file "/opt/cmc-restaurant/${DEPLOY_ENV}/.env" -f "$compose_file" -p "$COMPOSE_PROJECT_NAME" ps --format json 2>/dev/null || true)"
fi

cat > "${report_dir}/last-deployment.md" <<EOF
# Deployment Report

- Environment: ${DEPLOY_ENV}
- Frontend URL: ${frontend_url}
- API health URL: ${api_health_url}
- API readiness URL: ${api_ready_url}
- AI readiness URL: ${ai_ready_url}
- Protected semantic AI smoke (3 production cases): PASS
- AI retriever: ${expected_retriever}
- AI generation enabled: ${expected_generation}
- LLM model: ${LLM_MODEL}
- Checked at UTC: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- Result: PASS

## Compose Status

\`\`\`json
${compose_status}
\`\`\`
EOF

echo "Health check passed for ${DEPLOY_ENV}"
