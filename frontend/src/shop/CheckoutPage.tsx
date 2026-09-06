import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Banknote, Check, CreditCard, LocateFixed, MapPin, ShoppingBag, Store, Truck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useShop } from "./ShopContext";
import { CartContents } from "./MenuPage";
import { Empty, ErrorNotice } from "./ui";
import { money, selectionError, type Point, type Quote, type Recipient } from "./model";
import { newKey, readStored, shopApi, ShopApiError, writeStored } from "./api";
const DeliveryMap = lazy(() => import("./DeliveryMap"));

async function submissionKey(payload: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  const previous = readStored<{ fingerprint: string; key: string } | null>("may.pending-order", null);
  const pending = previous?.fingerprint === fingerprint ? previous : { fingerprint, key: newKey() };
  writeStored("may.pending-order", pending); return pending.key;
}

export function CheckoutPage() {
  const { catalog, config, cart, subtotal, count, orderType, setOrderType, remember, clear, reload } = useShop();
  const [recipient, setRecipient] = useState<Recipient>({ recipientName: "", phoneNumber: "", address: "", note: "" });
  const [point, setPoint] = useState<Point | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [method, setMethod] = useState("COD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const delivery = orderType === "Delivery";
  useEffect(() => {
    setQuote(null); setQuoteError("");
    if (!delivery || !point) { setQuoting(false); return; }
    let active = true; setQuoting(true);
    shopApi.quote(point).then(q => { if (active) setQuote(q); }).catch(e => { if (active) setQuoteError((e as Error).message); }).finally(() => { if (active) setQuoting(false); });
    return () => { active = false; };
  }, [delivery, point]);
  useEffect(() => { if (config && !config.allowCod) setMethod("VietQR"); }, [config]);
  const fee = delivery ? quote?.deliveryFee ?? null : 0;
  const total = fee === null ? null : subtotal + fee;
  const locate = () => {
    if (!navigator.geolocation) { setQuoteError("Trình duyệt chưa hỗ trợ vị trí. Hãy ghim điểm giao trên bản đồ."); return; }
    setLocating(true); setQuoteError("");
    navigator.geolocation.getCurrentPosition(pos => { setPoint({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setLocating(false); }, () => { setQuoteError("Chưa lấy được vị trí. Cho phép truy cập vị trí hoặc chọn điểm trên bản đồ."); setLocating(false); }, { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true });
  };
  const field = (key: keyof Recipient, value: string) => {
    setRecipient(r => ({ ...r, [key]: value }));
    if (key === "address") { setPoint(null); setQuote(null); }
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return;
    setError("");
    for (const line of cart) {
      const product = catalog?.items.find(p => p.id === line.menuItemId);
      if (!product || !product.isAvailable || selectionError(product, line.optionIds)) { setError("Một món hoặc tùy chọn trong giỏ vừa hết. Vui lòng quay lại thực đơn và chọn lại."); errorRef.current?.focus(); return; }
    }
    if (!config || total === null || (delivery && (!point || !quote))) { setError("Chọn điểm giao để Mây tính phí trước khi đặt đơn."); return; }
    if (subtotal < config.minimumOrder) { setError(`Đơn hàng tối thiểu ${money(config.minimumOrder)}.`); return; }
    if (!/^(0\d{9}|\+84\d{9})$/.test(recipient.phoneNumber.replace(/\s/g, ""))) { setError("Số điện thoại cần có 10 chữ số, bắt đầu bằng 0 (hoặc +84)."); return; }
    setBusy(true);
    const payload = { orderType, deliveryDetails: { ...recipient, recipientName: recipient.recipientName.trim(), phoneNumber: recipient.phoneNumber.replace(/\s/g, ""), ...(delivery ? point : {}), address: delivery ? recipient.address.trim() : null }, items: cart.map(({ menuItemId, quantity, optionIds, note }) => ({ menuItemId, quantity, optionIds, note })), expectedTotalAmount: total };
    try {
      const key = await submissionKey(payload);
      const order = await shopApi.create(payload, key);
      const persisted = remember(order);
      clear();
      try { localStorage.removeItem("may.pending-order"); } catch { /* Order is already stored in memory. */ }
      // Payment is a separate recoverable step: a failed QR request must never create a second order.
      navigate(`/orders/${encodeURIComponent(order.orderCode)}?method=${method}${persisted ? "" : "&storage=unavailable"}`);
    } catch (e) {
      if (e instanceof ShopApiError && e.status === 409) {
        reload(); setPoint(null); setQuote(null);
        setError(`${e.message} Thực đơn đã được tải lại. Vui lòng kiểm tra giá và chọn lại điểm giao trước khi đặt.`);
      } else setError((e as Error).message);
    }
    finally { setBusy(false); }
  }
  if (!count) return <div className="may-narrow"><Empty title="Thêm một món ngon nhé" action={<Link className="may-button" to="/">Mở thực đơn <ArrowRight size={18} /></Link>}>Giỏ của bạn đang trống.</Empty></div>;
  return <div className="may-checkout"><Link className="may-back" to="/"><ArrowLeft size={17} />Quay lại thực đơn</Link><div className="may-page-title"><div><p className="may-kicker">Sắp có món ngon rồi</p><h1>Mây giao <em>niềm vui.</em></h1></div><div className="may-checkout-steps"><span className="done"><Check size={15} />Chọn món</span><i /><span className="active">2. Đặt đơn</span><i /><span>3. Nhận món</span></div></div>
    <form onSubmit={submit} className="may-checkout-grid"><div className="may-checkout-main">
      <section className="may-panel"><h2><Truck size={22} />Bạn nhận món thế nào?</h2><div className="may-fulfillment"><button type="button" aria-pressed={delivery} className={delivery ? "is-selected" : ""} onClick={() => setOrderType("Delivery")}><Truck size={23} /><strong>Giao tận nơi</strong><small>Mây mang món đến bạn</small></button><button type="button" aria-pressed={!delivery} className={!delivery ? "is-selected" : ""} onClick={() => setOrderType("Pickup")}><Store size={23} /><strong>Tự đến lấy</strong><small>Ghé quán khi món đã sẵn sàng</small></button></div>{!delivery && <div className="may-info"><MapPin size={20} /><p><strong>Mây · Điểm nhận món</strong><span>{config?.address}</span></p></div>}</section>
      <section className="may-panel"><h2><MapPin size={22} />{delivery ? "Giao đến bạn" : "Thông tin người nhận"}</h2><div className="may-form-row"><label className="may-field">Họ tên người nhận<input required autoComplete="name" maxLength={200} value={recipient.recipientName} onChange={e => field("recipientName", e.target.value)} placeholder="Tên để Mây gọi bạn" /></label><label className="may-field">Số điện thoại<input required type="tel" autoComplete="tel" maxLength={20} value={recipient.phoneNumber} onChange={e => field("phoneNumber", e.target.value)} placeholder="09xx xxx xxx" /></label></div>
      {delivery && <><label className="may-field">Địa chỉ giao hàng<input required autoComplete="street-address" maxLength={1000} placeholder="Số nhà, tên đường, phường/xã…" value={recipient.address} onChange={e => field("address", e.target.value)} /></label><div className="may-section-row may-map-title"><div><strong>Ghim đúng điểm giao</strong><p className="may-small">Chọn trên bản đồ để xem phí. Điểm ghim cần khớp địa chỉ ở trên.</p></div><button type="button" className="may-tool" disabled={locating} onClick={locate}><LocateFixed size={17} />{locating ? "Đang định vị…" : "Vị trí của tôi"}</button></div>{config?.latitude != null && config.longitude != null ? <Suspense fallback={<div className="may-map-placeholder">Đang mở bản đồ…</div>}><DeliveryMap origin={{ latitude: config.latitude, longitude: config.longitude }} point={point} onChange={setPoint} /></Suspense> : <ErrorNotice message="Quán chưa cấu hình điểm xuất phát. Bạn có thể chọn tự đến lấy hoặc liên hệ quán." />}
      <details className="may-coordinate-input"><summary>Nhập tọa độ thay cho bản đồ</summary><div className="may-form-row"><label className="may-field">Vĩ độ<input type="number" step="any" min={-90} max={90} value={point?.latitude ?? ""} onChange={e => setPoint(e.target.value ? { latitude: Number(e.target.value), longitude: point?.longitude ?? config?.longitude ?? 0 } : null)} /></label><label className="may-field">Kinh độ<input type="number" step="any" min={-180} max={180} value={point?.longitude ?? ""} onChange={e => setPoint(e.target.value ? { latitude: point?.latitude ?? config?.latitude ?? 0, longitude: Number(e.target.value) } : null)} /></label></div></details>
      {quoteError && <ErrorNotice message={quoteError} />}{quoting ? <p role="status">Đang tính phí giao hàng…</p> : quote ? <div className="may-info"><Truck size={20} /><p><strong>{quote.distanceKm.toFixed(2)} km từ quán · {quote.deliveryFee === 0 ? "Miễn phí giao hàng" : money(quote.deliveryFee)}</strong><span>Miễn phí {config?.shippingFreeRadiusKm} km đầu, {money(config?.shippingPerKm ?? 4000)}/km vượt quá, làm tròn lên.</span></p></div> : <p className="may-small">Chưa chọn điểm giao. Phí sẽ hiển thị trước khi bạn đặt.</p>}</>}
      <label className="may-field">Lời nhắn cho Mây <small>Không bắt buộc</small><textarea maxLength={500} placeholder="Tầng, số phòng hoặc hướng dẫn giao hàng…" value={recipient.note} onChange={e => field("note", e.target.value)} /></label></section>
      <section className="may-panel"><h2><CreditCard size={22} />Thanh toán</h2><div className="may-payment-methods">{config?.allowCod && <label className={`may-payment-option ${method === "COD" ? "is-selected" : ""}`}><input type="radio" name="method" value="COD" checked={method === "COD"} onChange={() => setMethod("COD")} /><Banknote size={26} /><span><strong>{delivery ? "Tiền mặt khi nhận hàng" : "Tiền mặt tại quầy"}</strong><small>{delivery ? "Trả cho nhân viên giao hàng của Mây" : "Nhân viên xác nhận tiền trước khi chuẩn bị"}</small></span></label>}<label className={`may-payment-option ${method === "VietQR" ? "is-selected" : ""}`}><input type="radio" name="method" value="VietQR" checked={method === "VietQR"} onChange={() => setMethod("VietQR")} /><CreditCard size={26} /><span><strong>Chuyển khoản VietQR</strong><small>Quét mã sau khi tạo đơn · xác nhận tự động</small></span></label></div></section>
    </div><aside className="may-checkout-summary may-panel"><div className="may-section-row"><h2><ShoppingBag size={21} />Đơn của bạn</h2><Link to="/cart" className="may-link">Sửa</Link></div><CartContents compact /><dl className="may-totals"><div><dt>Tiền món ({count} món)</dt><dd>{money(subtotal)}</dd></div><div><dt>Phí giao hàng</dt><dd>{fee === null ? "Chọn điểm giao" : fee === 0 ? "Miễn phí" : money(fee)}</dd></div><div className="may-total"><dt>Tổng thanh toán</dt><dd>{total === null ? "—" : money(total)}</dd></div></dl><p className="may-small">{delivery ? "Tổng tiền đã bao gồm phí ship." : "Bạn tự đến lấy tại quán, không có phí ship."}</p><div ref={errorRef} tabIndex={-1}>{error && <ErrorNotice message={error} />}</div><button className="may-button" disabled={busy || quoting || total === null || !config} type="submit">{busy ? "Đang tạo đơn…" : "Xác nhận đặt món"}<ArrowRight size={18} /></button><p className="may-small may-center">{method === "COD" ? "Mây sẽ tiếp nhận đơn và cập nhật tiến độ cho bạn." : "Bạn sẽ thấy mã QR và số tiền chính xác ở bước tiếp theo."}</p></aside></form>
  </div>;
}
