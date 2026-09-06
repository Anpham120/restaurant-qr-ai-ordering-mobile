import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChefHat, Copy, CreditCard, MapPin, PackageCheck, Phone, RefreshCw, ShoppingBag, Store, Truck, Wallet } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useShop } from "./ShopContext";
import { newKey, readStored, request, shopApi, writeStored } from "./api";
import { money, orderLabel, settled, type PaymentResult, type ShopOrder } from "./model";
import { Empty, ErrorNotice } from "./ui";

export function OrdersPage() {
  const { saved } = useShop();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true); setError("");
    Promise.all(saved.map(s => shopApi.order(s.orderCode, s.token))).then(setOrders).catch(e => setError((e as Error).message)).finally(() => setLoading(false));
  }, [saved]);
  useEffect(load, [load]);
  return <div className="may-narrow"><div className="may-page-title"><div><p className="may-kicker">Mỗi đơn, một niềm vui</p><h1>Đơn <em>của bạn.</em></h1></div><button className="may-tool" disabled={loading} onClick={load}><RefreshCw size={17} />Làm mới</button></div><p className="may-muted">Các đơn bạn đặt trên thiết bị này. Mở một đơn để xem thanh toán và tiến độ mới nhất.</p>{error ? <ErrorNotice message={error} retry={load} /> : loading ? <p className="may-loading" role="status">Đang tìm đơn của bạn…</p> : orders.length ? <div className="may-orders-list">{orders.map(order => <Link key={order.orderCode} className="may-history-card" to={`/orders/${order.orderCode}`}><div className="may-section-row"><span className="may-order-code">{order.orderCode}</span><span className="may-badge">{orderLabel(order)}</span></div><p className="may-small">{new Date(order.createdAt).toLocaleString("vi-VN")} · {order.orderType === "Delivery" ? "Giao tận nơi" : order.orderType === "Pickup" ? "Tự đến lấy" : `Bàn ${order.tableCode}`}</p><h2>{order.items.map(i => `${i.quantity} ${i.name}`).join(", ")}</h2><div className="may-section-row"><strong>{money(order.totalAmount)}</strong><span className="may-link">Xem chi tiết <ArrowRight size={17} /></span></div></Link>)}</div> : <Empty title="Chưa có đơn nào" action={<Link className="may-button" to="/">Chọn món đầu tiên <ArrowRight size={18} /></Link>}>Một ly trà, một phần chè — bắt đầu từ món bạn thích nhé.</Empty>}</div>;
}

export function OrderPage() {
  const { orderCode = "" } = useParams();
  const { saved, config } = useShop();
  const [params] = useSearchParams();
  const token = saved.find(s => s.orderCode === orderCode)?.token ?? "";
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState(params.get("method") ?? "COD");
  const [copied, setCopied] = useState(false);
  const keyRef = useRef<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!token) return;
    try { const next = await shopApi.order(orderCode, token); setOrder(next); setError(""); } catch (e) { setError((e as Error).message); }
  }, [orderCode, token]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { if (config && !config.allowCod) setMethod("VietQR"); }, [config]);
  async function pay(chosen: string) {
    setBusy(true); setError("");
    const storageKey = `may.payment-key.${orderCode}.${chosen}`;
    let key = keyRef.current[chosen] ?? readStored<string | null>(storageKey, null);
    if (!key) { key = newKey(); writeStored(storageKey, key); }
    keyRef.current[chosen] = key;
    try { setPayment(await shopApi.payment(orderCode, token, chosen, key)); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!token) return <div className="may-narrow"><Empty title="Cần mã truy cập của đơn" action={<Link className="may-button" to="/orders">Về đơn của bạn</Link>}>Mở đơn trên thiết bị đã đặt hoặc liên hệ quán với mã {orderCode}. Thông tin giao hàng chỉ hiển thị khi có quyền truy cập.</Empty></div>;
  if (!order) return <div className="may-narrow">{error ? <ErrorNotice message={error} retry={() => void load()} /> : <p className="may-loading" role="status">Đang mở đơn {orderCode}…</p>}</div>;
  const isPaid = settled(order.paymentStatus);
  const delivered = order.status === "Completed" || order.fulfillmentStatus === "Delivered";
  const failed = order.fulfillmentStatus === "Failed" || order.status === "Cancelled";
  const inProgress = ["Preparing", "Ready", "Served", "Completed"].includes(order.status);
  const dispatched = ["OutForDelivery", "Delivered"].includes(order.fulfillmentStatus ?? "");
  const accepted = isPaid || !!order.codAccepted || order.orderType === "DineIn";
  const stages = [
    { label: "Đã đặt món", text: "Mây đã nhận thông tin đơn", icon: ShoppingBag, done: true },
    { label: order.paymentMethod === "COD" ? "Quán tiếp nhận" : "Xác nhận thanh toán", text: order.paymentMethod === "COD" ? "Nhân viên kiểm tra và nhận đơn COD" : "Xác nhận tiền trước khi chuẩn bị", icon: Wallet, done: accepted },
    { label: "Chuẩn bị món", text: "Chế biến theo lựa chọn của bạn", icon: ChefHat, done: inProgress },
    { label: order.orderType === "Delivery" ? "Giao đến bạn" : "Sẵn sàng nhận", text: order.orderType === "Delivery" ? "Nhân viên Mây mang món đến" : "Ghé quầy và đọc mã đơn", icon: order.orderType === "Delivery" ? Truck : Store, done: dispatched || (order.orderType !== "Delivery" && ["Ready", "Served", "Completed"].includes(order.status)) },
    { label: "Thưởng thức thôi", text: "Cảm ơn bạn đã chọn Mây", icon: PackageCheck, done: delivered },
  ];
  return <div className="may-tracking"><Link className="may-back" to="/orders"><ArrowLeft size={17} />Đơn của bạn</Link><div className="may-tracking-hero"><span className="may-large-icon">{delivered ? <CheckCircle2 size={38} strokeWidth={1.5} /> : <ShoppingBag size={38} strokeWidth={1.5} />}</span><p className="may-kicker">{order.orderCode}</p><h1>{orderLabel(order)}</h1><p>{delivered ? "Mong món ngon làm ngày của bạn vui hơn một chút." : "Bạn có thể yên tâm rời màn hình. Mở lại đơn để xem tiến độ."}</p><span className="may-badge">{order.orderType === "Delivery" ? "Giao tận nơi" : "Nhận món tại quán"} · {money(order.totalAmount)}</span></div>
    {params.has("storage") && <ErrorNotice message="Trình duyệt chưa lưu được mã truy cập đơn. Giữ màn hình này mở và ghi lại mã đơn để liên hệ quán." />}
    {error && <ErrorNotice message={error} retry={() => void load()} />}
    <div className="may-tracking-grid"><div>
      {!isPaid && !failed && !delivered && <section className="may-panel may-payment-panel"><h2><CreditCard size={22} />{order.paymentMethod === "COD" && order.paymentStatus === "Pending" ? "Thanh toán khi nhận món" : "Hoàn tất bước thanh toán"}</h2>{order.paymentStatus === "NotRequested" || order.paymentStatus === "Unpaid" || order.paymentStatus === "Failed" || order.paymentStatus === "Cancelled" ? <><p>Kiểm tra lại tổng tiền đã bao gồm phí giao hàng: <strong>{money(order.totalAmount)}</strong>.</p><div className="may-options"><label className="may-choice"><input type="radio" name="pay-method" checked={method === "VietQR"} onChange={() => setMethod("VietQR")} />VietQR</label>{config?.allowCod && <label className="may-choice"><input type="radio" name="pay-method" checked={method === "COD"} onChange={() => setMethod("COD")} />{order.orderType === "Delivery" ? "Tiền mặt khi nhận hàng" : "Tiền mặt tại quầy"}</label>}</div><button className="may-button" disabled={busy} onClick={() => void pay(method)}>{busy ? "Đang xử lý…" : method === "COD" ? "Xác nhận thanh toán tiền mặt" : "Lấy mã VietQR"}<ArrowRight size={18} /></button></> : order.paymentMethod === "VietQR" ? <><p>Quét đúng mã, chuyển đủ tiền và giữ nguyên nội dung. Mây sẽ cập nhật khi nhận được xác nhận.</p>{payment?.vietQr ? <div className="may-qr-area"><img src={payment.vietQr.qrImageDataUri || payment.vietQr.quickLink} alt={`Mã VietQR thanh toán ${order.orderCode}`} width="260" height="260" /><strong>{money(order.totalAmount)}</strong><code>{payment.vietQr.transferContent}</code><button className="may-tool" onClick={() => { navigator.clipboard.writeText(payment.vietQr!.transferContent).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => setError("Chưa sao chép được. Bạn có thể chọn nội dung chuyển khoản và sao chép thủ công.")); }}><Copy size={16} />{copied ? "Đã sao chép" : "Sao chép nội dung"}</button><span className="may-small" role="status">Đang chờ xác nhận thanh toán…</span></div> : <button className="may-button" disabled={busy} onClick={() => void pay("VietQR")}>{busy ? "Đang tải mã…" : "Hiển thị lại mã VietQR"}</button>}</> : <div className="may-info"><Wallet size={24} /><p><strong>Cần thanh toán: {money(order.totalAmount)}</strong><span>{order.orderType === "Delivery" ? "Trả tiền trực tiếp cho nhân viên giao hàng. Tổng đã gồm phí ship." : "Đọc mã đơn tại quầy và thanh toán để Mây bắt đầu chuẩn bị."}</span></p></div>}</section>}
      <section className="may-panel"><div className="may-section-row"><h2>Hành trình món ngon</h2><button className="may-icon" aria-label="Cập nhật trạng thái đơn" onClick={() => void load()}><RefreshCw size={18} /></button></div><ol className="may-timeline">{stages.map((stage, i) => <li className={stage.done ? "is-done" : ""} key={stage.label}><span className="may-timeline-icon">{stage.done ? <Check size={19} /> : <stage.icon size={19} />}</span><div><strong>{stage.label}</strong><p>{stage.text}</p></div>{i === 0 && <time>{new Date(order.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>}</li>)}</ol>{failed && <ErrorNotice message={order.fulfillmentStatus === "Failed" ? "Nhân viên chưa giao được đơn. Vui lòng liên hệ quán để thống nhất cách xử lý." : "Đơn này đã hủy. Liên hệ quán nếu bạn đã chuyển khoản."} />}</section>
      <section className="may-panel"><h2><MapPin size={22} />{order.orderType === "Delivery" ? "Thông tin giao hàng" : "Điểm nhận món"}</h2><p><strong>{order.deliveryDetails?.recipientName}</strong> · {order.deliveryDetails?.phoneNumber}</p><p>{order.orderType === "Delivery" ? order.deliveryDetails?.address : config?.address}</p>{order.deliveryDetails?.note && <p className="may-muted">Lời nhắn: {order.deliveryDetails.note}</p>}{config?.phone && <a className="may-tool" href={`tel:${config.phone}`}><Phone size={17} />Liên hệ Mây</a>}</section>
    </div><aside className="may-panel may-order-receipt"><p className="may-kicker">Được chuẩn bị riêng cho bạn</p><h2>Chi tiết đơn</h2>{order.items.map(item => <div className="may-receipt-line" key={item.orderItemId}><div><strong>{item.quantity} × {item.name}</strong><p>{item.note}</p><small>{item.status === "Cancelled" ? "Đã hủy" : ""}</small></div><b>{money(item.lineTotal)}</b></div>)}<dl className="may-totals"><div><dt>Tạm tính</dt><dd>{money(order.subtotalAmount)}</dd></div>{order.discountAmount > 0 && <div><dt>Ưu đãi</dt><dd>−{money(order.discountAmount)}</dd></div>}<div><dt>Phí giao hàng</dt><dd>{order.deliveryFee > 0 ? money(order.deliveryFee) : "Miễn phí"}</dd></div><div className="may-total"><dt>Tổng cộng</dt><dd>{money(order.totalAmount)}</dd></div></dl><div className="may-receipt-payment">{isPaid ? <CheckCircle2 size={17} /> : <Wallet size={17} />}<span>{isPaid ? "Đã thanh toán" : "Chưa thanh toán"}</span></div><Link className="may-button may-button-outline" to="/">Chọn thêm món <ArrowRight size={17} /></Link></aside></div>
  </div>;
}
