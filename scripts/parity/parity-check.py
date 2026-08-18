"""So khớp hành vi .NET vs Java trên cùng một kịch bản (issue #15).

Chạy từng bước trên CẢ HAI stack, so HTTP status + hình dạng JSON. Không so giá trị sinh ngẫu
nhiên (id, token, thời điểm) vì chúng khác nhau là đương nhiên — cái cần so là contract.
"""
import json
import os
import urllib.error
import urllib.request

NET = "http://par-api-net:8080"
QR_NET = os.environ["QR_NET"]
QR_JAVA = os.environ["QR_JAVA"]
JAVA = "http://par-api-java:8081"

rows = []


def call(base, method, path, body=None, headers=None):
    req = urllib.request.Request(
        base + path,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw.strip() else None
        except Exception:
            return e.code, {"_raw": raw[:200]}
    except Exception as e:
        return 0, {"_err": type(e).__name__}


def shape(v, depth=0):
    """Tên trường + kiểu, bỏ giá trị. Đủ để phát hiện lệch contract mà không báo động giả."""
    if depth > 3:
        return "..."
    if isinstance(v, dict):
        return {k: shape(v[k], depth + 1) for k in sorted(v)}
    if isinstance(v, list):
        return [shape(v[0], depth + 1)] if v else []
    if v is None:
        return "null"
    return type(v).__name__


def err_code(body):
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        return body["error"].get("code")
    return None


def compare(label, method, path, body=None, hdr_net=None, hdr_java=None, focus="shape"):
    sn, bn = call(NET, method, path, body, hdr_net)
    sj, bj = call(JAVA, method, path, body, hdr_java)
    if focus == "error":
        an, aj = err_code(bn), err_code(bj)
    else:
        an, aj = shape(bn), shape(bj)
    same_status = sn == sj
    same_payload = an == aj
    rows.append({
        "label": label, "path": f"{method} {path}",
        "net_status": sn, "java_status": sj,
        "same_status": same_status, "same_payload": same_payload,
        "net": an, "java": aj,
    })
    return (sn, bn), (sj, bj)


# ---------------------------------------------------------------- health
compare("Health", "GET", "/api/health")

# ---------------------------------------------------------------- auth
reg = {"fullName": "Parity Tester", "email": "parity@test.local", "password": "Passw0rd!123"}
compare("Đăng ký", "POST", "/api/auth/register", reg)
compare("Đăng ký trùng email", "POST", "/api/auth/register", reg, focus="error")
compare("Đăng nhập", "POST", "/api/auth/login", {"email": reg["email"], "password": reg["password"]})
compare("Đăng nhập sai mật khẩu", "POST", "/api/auth/login",
        {"email": reg["email"], "password": "wrong"}, focus="error")

# ---------------------------------------------------------------- menu / tables
compare("Menu", "GET", "/api/menu")
compare("Bàn theo mã", "GET", "/api/tables/T01")
compare("Bàn không tồn tại", "GET", "/api/tables/T99", focus="error")

# ---------------------------------------------------------------- table session
sess_net = {"tableCode": "T01", "qrToken": QR_NET}
sess_java = {"tableCode": "T01", "qrToken": QR_JAVA}
sn_, sn_body = call(NET, "POST", "/api/table-sessions", sess_net)
sj_, sj_body = call(JAVA, "POST", "/api/table-sessions", sess_java)
rows.append({"label": "Mở phiên bàn", "path": "POST /api/table-sessions",
             "net_status": sn_, "java_status": sj_, "same_status": sn_ == sj_,
             "same_payload": shape(sn_body) == shape(sj_body), "net": shape(sn_body), "java": shape(sj_body)})
compare("Mở phiên thiếu qrToken", "POST", "/api/table-sessions", {"tableCode": "T01"}, focus="error")

net_sid = (sn_body or {}).get("sessionId")
java_sid = (sj_body or {}).get("sessionId")

# ---------------------------------------------------------------- orders
def order_body(sid, qr):
    return {"orderType": "DineIn", "tableCode": "T01", "qrToken": qr,
            "tableSessionId": sid, "items": [{"menuItemId": "m_004", "quantity": 2}]}


sn, bn = call(NET, "POST", "/api/orders", order_body(net_sid, QR_NET), {"Idempotency-Key": "parity-1"})
sj, bj = call(JAVA, "POST", "/api/orders", order_body(java_sid, QR_JAVA), {"Idempotency-Key": "parity-1"})
rows.append({"label": "Tạo đơn", "path": "POST /api/orders",
             "net_status": sn, "java_status": sj, "same_status": sn == sj,
             "same_payload": shape(bn) == shape(bj), "net": shape(bn), "java": shape(bj)})

net_code = (bn or {}).get("orderCode")
java_code = (bj or {}).get("orderCode")
net_tok = (bn or {}).get("customerAccessToken")
java_tok = (bj or {}).get("customerAccessToken")

# thiếu Idempotency-Key
compare("Tạo đơn thiếu Idempotency-Key", "POST", "/api/orders",
        order_body(net_sid, QR_NET), focus="error")

# đọc đơn bằng token đúng / sai
compare("Xem đơn (token đúng)", "GET", f"/api/orders/{net_code}" if net_code else "/api/orders/X",
        hdr_net={"X-Order-Token": net_tok or ""}, hdr_java={"X-Order-Token": java_tok or ""})
compare("Xem đơn (token sai)", "GET", f"/api/orders/{net_code}" if net_code else "/api/orders/X",
        hdr_net={"X-Order-Token": "wrong"}, hdr_java={"X-Order-Token": "wrong"}, focus="error")

# ---------------------------------------------------------------- payments
compare("Xem thanh toán", "GET", f"/api/orders/{net_code}/payment" if net_code else "/api/orders/X/payment",
        hdr_net={"X-Order-Token": net_tok or ""}, hdr_java={"X-Order-Token": java_tok or ""})
compare("Yêu cầu thanh toán sai method", "POST",
        f"/api/orders/{net_code}/payment/request" if net_code else "/api/orders/X/payment/request",
        {"method": "Bitcoin"},
        hdr_net={"X-Order-Token": net_tok or "", "Idempotency-Key": "parity-p1"},
        hdr_java={"X-Order-Token": java_tok or "", "Idempotency-Key": "parity-p1"}, focus="error")

sn, bn = call(NET, "POST", f"/api/orders/{net_code}/payment/request", {"method": "VietQR"},
              {"X-Order-Token": net_tok or "", "Idempotency-Key": "parity-p2"})
sj, bj = call(JAVA, "POST", f"/api/orders/{java_code}/payment/request", {"method": "VietQR"},
              {"X-Order-Token": java_tok or "", "Idempotency-Key": "parity-p2"})
rows.append({"label": "Yêu cầu thanh toán VietQR", "path": "POST .../payment/request",
             "net_status": sn, "java_status": sj, "same_status": sn == sj,
             "same_payload": shape(bn) == shape(bj), "net": shape(bn), "java": shape(bj)})

# so nội dung chuyển khoản + quick link (phần khách thật sự dùng)
def vq(b):
    v = (b or {}).get("vietQr") or {}
    return {"transferContent": v.get("transferContent"), "quickLink": (v.get("quickLink") or "")[:80]}


rows.append({"label": "Nội dung chuyển khoản VietQR", "path": "(nội dung, không phải hình dạng)",
             "net_status": sn, "java_status": sj, "same_status": sn == sj,
             "same_payload": vq(bn) == vq(bj), "net": vq(bn), "java": vq(bj)})

# ---------------------------------------------------------------- 401/403
compare("Danh sách đơn khi chưa đăng nhập", "GET", "/api/orders", focus="error")

print(json.dumps(rows, ensure_ascii=False, indent=1))
