import { useEffect, useRef, useState } from "react";
import { useI18n } from "@cmc/i18n";
import { localizeMenuItemName } from "@cmc/i18n/menu";
import { Banknote, QrCode, ReceiptText, X } from "lucide-react";
import { validatePromotion } from "../services/orderService";
import type {
  RequestedPaymentMethod,
  TableInvoice,
  TableInvoicePaymentRequest,
} from "../types";
import {
  getInvoicePaymentTotal,
  validateAppliedPromotion,
  type PromotionPreview,
} from "./tableInvoicePaymentModel";

type Props = {
  invoice: TableInvoice;
  onClose: () => void;
  onRequest: (payload: TableInvoicePaymentRequest) => Promise<void>;
};

export function TableInvoicePaymentModal({ invoice, onClose, onRequest }: Props) {
  const { formatMoney, locale, t } = useI18n();
  const [method, setMethod] = useState<RequestedPaymentMethod>("COD");
  const [promotionCode, setPromotionCode] = useState("");
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState("");
  const [loyaltyCode, setLoyaltyCode] = useState("");
  const [promotionPreview, setPromotionPreview] = useState<PromotionPreview | null>(null);
  const [isApplyingPromotion, setIsApplyingPromotion] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isSubmittingRef = useRef(false);
  const firstOptionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstOptionRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmittingRef.current) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function applyPromotion() {
    const code = promotionCode.trim().toUpperCase();
    if (!code) {
      setPromotionPreview(null);
      setError("");
      return;
    }
    setIsApplyingPromotion(true);
    setError("");
    try {
      const preview = await validatePromotion(code, invoice.subtotalAmount);
      setPromotionCode(preview.code);
      setPromotionPreview(preview);
    } catch (caughtError) {
      setPromotionPreview(null);
      setError(t(caughtError instanceof Error ? caughtError.message : "Mã ưu đãi không hợp lệ."));
    } finally {
      setIsApplyingPromotion(false);
    }
  }

  async function submitRequest() {
    if (isSubmittingRef.current) return;
    const normalizedPromotionCode = promotionCode.trim().toUpperCase();
    const promotionError = validateAppliedPromotion(promotionCode, promotionPreview);
    if (promotionError) {
      setError(promotionError);
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError("");
    try {
      await onRequest({
        method,
        promotionCode: normalizedPromotionCode || null,
        customerPhoneNumber: customerPhoneNumber.trim() || null,
        // Chuẩn hoá giống hệt phía máy chủ: khách đọc mã theo cụm nên hay gõ kèm gạch nối, và
        // từ chối vì một dấu gạch là bắt họ sửa thứ đáng lẽ hệ thống tự hiểu.
        loyaltyCode: loyaltyCode.trim().toUpperCase().replace(/[-\s]/g, "") || null,
      });
    } catch (caughtError) {
      setError(t(caughtError instanceof Error ? caughtError.message : "Không gửi được yêu cầu thanh toán."));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const discountAmount = promotionPreview?.discountAmount ?? 0;
  const totalAmount = getInvoicePaymentTotal(invoice, promotionPreview);

  return (
    <div
      className="table-invoice-overlay"
      onClick={(event) => {
        if (event.currentTarget === event.target && !isSubmittingRef.current) onClose();
      }}
    >
      <section
        aria-labelledby="table-invoice-payment-title"
        aria-modal="true"
        className="table-invoice-modal"
        role="dialog"
      >
        <header className="table-invoice-modal-header">
          <div>
            <span>{t("Hóa đơn phiên bàn {table}", { table: invoice.tableCode ?? "—" })}</span>
            <h2 id="table-invoice-payment-title">{t("Yêu cầu thanh toán")}</h2>
          </div>
          <button aria-label={t("Đóng")} disabled={isSubmitting} onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button>
        </header>

        <div className="table-invoice-modal-body">
          <section className="table-invoice-receipt" aria-label={t("Tóm tắt hóa đơn")}>
            <div className="table-invoice-receipt-title"><ReceiptText aria-hidden="true" size={20} /><strong>{t("{count} lần gọi món", { count: invoice.orderRounds.length })}</strong></div>
            <ul>
              {invoice.items.map((item) => (
                <li key={item.menuItemId}><span>{item.quantity}× {localizeMenuItemName(item.menuItemId, item.name, locale)}</span><strong data-money>{formatMoney(item.lineTotal)}</strong></li>
              ))}
            </ul>
            <div className="table-invoice-total-row"><span>{t("Tạm tính")}</span><strong data-money>{formatMoney(invoice.subtotalAmount)}</strong></div>
            {discountAmount > 0 ? <div className="table-invoice-discount-row"><span>{t("Ưu đãi {code}", { code: promotionPreview?.code ?? "" })}</span><strong data-money>-{formatMoney(discountAmount)}</strong></div> : null}
            <div className="table-invoice-grand-total"><span>{t("Cần thanh toán")}</span><strong data-money>{formatMoney(totalAmount)}</strong></div>
          </section>

          <section className="table-invoice-fields" aria-label={t("Ưu đãi và tích điểm")}>
            <label>
              <span>{t("Mã ưu đãi")} <small>{t("(tùy chọn)")}</small></span>
              <div className="table-invoice-promotion-input">
                <input
                  onChange={(event) => { setPromotionCode(event.target.value); setPromotionPreview(null); }}
                  placeholder={t("Ví dụ: GIAM10")}
                  value={promotionCode}
                />
                <button disabled={isApplyingPromotion || isSubmitting} onClick={() => void applyPromotion()} type="button">
                  {isApplyingPromotion ? t("Đang kiểm tra") : t("Áp dụng")}
                </button>
              </div>
            </label>
            <label>
              <span>{t("Mã đổi điểm")} <small>{t("(tùy chọn)")}</small></span>
              <input
                autoComplete="off"
                onChange={(event) => setLoyaltyCode(event.target.value)}
                placeholder={t("Mã bạn đổi bằng điểm trong ứng dụng")}
                value={loyaltyCode}
              />
            </label>
            <label>
              <span>{t("Số điện thoại tích điểm")} <small>{t("(tùy chọn)")}</small></span>
              <input
                inputMode="tel"
                onChange={(event) => setCustomerPhoneNumber(event.target.value)}
                placeholder="0909xxxxxx"
                value={customerPhoneNumber}
              />
            </label>
          </section>

          <fieldset className="table-invoice-methods">
            <legend>{t("Phương thức thanh toán")}</legend>
            <label className={method === "COD" ? "is-selected" : ""}>
              <input checked={method === "COD"} name="invoice-payment-method" onChange={() => setMethod("COD")} ref={firstOptionRef} type="radio" />
              <Banknote aria-hidden="true" size={22} /><span><strong>{t("Tiền mặt")}</strong><small>{t("Nhân viên đến bàn thu tiền")}</small></span>
            </label>
            <label className={method === "VietQR" ? "is-selected" : ""}>
              <input checked={method === "VietQR"} name="invoice-payment-method" onChange={() => setMethod("VietQR")} type="radio" />
              <QrCode aria-hidden="true" size={22} /><span><strong>VietQR</strong><small>{t("Quét mã bằng ứng dụng ngân hàng")}</small></span>
            </label>
          </fieldset>

          {error ? <p className="ordering-inline-error" role="alert">{error}</p> : null}
        </div>

        <footer className="table-invoice-modal-actions">
          <button className="is-secondary" disabled={isSubmitting} onClick={onClose} type="button">{t("Để sau")}</button>
          <button disabled={isSubmitting} onClick={() => void submitRequest()} type="button">{isSubmitting ? t("Đang gửi...") : t("Thanh toán {amount}", { amount: formatMoney(totalAmount) })}</button>
        </footer>
      </section>
    </div>
  );
}
