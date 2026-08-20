import { useCallback, useEffect, useState } from "react";
import type { Promotion, PromotionRequest, PromotionType } from "@cmc/shared-types";
import { api } from "../../services/apiClient";
import { Tags, X } from "lucide-react";
import "../../components/operations/operations.css";
import { useOpsConfirm } from "../../components/operations/OpsConfirmProvider";

const EMPTY: PromotionRequest = {
  code: "",
  name: "",
  description: "",
  type: "Percentage",
  discountValue: 10,
  minOrderAmount: null,
  maxDiscountAmount: null,
  isFlashSale: false,
  startsAt: null,
  endsAt: null,
  isActive: true,
};

function formatVnd(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("vi-VN")}đ`;
}

export function AdminPromotionsPage() {
  const confirm = useOpsConfirm();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionRequest>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.promotions.list();
      setPromotions(data);
    } catch {
      setError("Không tải được khuyến mãi.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setNotice("");
    setShowForm(true);
  }

  function openEdit(promotion: Promotion) {
    setEditingId(promotion.promotionId);
    setForm({
      code: promotion.code,
      name: promotion.name,
      description: promotion.description ?? "",
      type: promotion.type,
      discountValue: promotion.discountValue,
      minOrderAmount: promotion.minOrderAmount,
      maxDiscountAmount: promotion.maxDiscountAmount,
      isFlashSale: promotion.isFlashSale,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      isActive: promotion.isActive,
    });
    setNotice("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.code.trim()) {
      setNotice("Mã khuyến mãi không được trống.");
      return;
    }
    if (!form.name.trim()) {
      setNotice("Tên chương trình không được trống.");
      return;
    }
    if (form.discountValue <= 0) {
      setNotice("Giá trị giảm phải lớn hơn 0.");
      return;
    }

    setIsSaving(true);
    setNotice("");
    try {
      const payload: PromotionRequest = {
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || null,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
      };
      if (editingId) {
        await api.promotions.update(editingId, payload);
        setNotice("Đã cập nhật khuyến mãi.");
      } else {
        await api.promotions.create(payload);
        setNotice("Đã tạo khuyến mãi.");
      }
      setShowForm(false);
      await load();
    } catch {
      setNotice("Lưu thất bại (mã có thể đã tồn tại).");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: "Xoá khuyến mãi này?",
      message: "Mã đang phát cho khách sẽ ngừng áp dụng ngay.",
      confirmLabel: "Xoá khuyến mãi",
      danger: true,
    }))) return;
    try {
      await api.promotions.delete(id);
      setNotice("Đã xóa khuyến mãi.");
      await load();
    } catch {
      setNotice("Xóa thất bại.");
    }
  }

  if (isLoading) {
    return <div className="ops-empty"><div className="ops-empty-icon"><Tags aria-hidden="true" /></div>Đang tải...</div>;
  }

  return (
    <div>
      <div className="ops-page-header">
        <h1>Khuyến mãi</h1>
        <p>Quản lý mã giảm giá và chương trình flash sale</p>
      </div>

      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className="ops-toolbar">
        <button className="ops-btn ops-btn--primary" onClick={openCreate} type="button">+ Thêm khuyến mãi</button>
      </div>

      {showForm ? (
        <div className="ops-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <h2>{editingId ? "Sửa khuyến mãi" : "Thêm khuyến mãi"}</h2>
              <button aria-label="Đóng" className="ops-modal-close" onClick={() => setShowForm(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </div>
            <div className="ops-modal-body">
              <div className="ops-form-group">
                <label className="ops-form-label">Mã *</label>
                <input className="ops-form-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="VD: GIAM10" />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Tên chương trình *</label>
                <input className="ops-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Mô tả</label>
                <input className="ops-form-input" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Loại giảm</label>
                <select className="ops-form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PromotionType })}>
                  <option value="Percentage">Phần trăm (%)</option>
                  <option value="FixedAmount">Số tiền cố định (đ)</option>
                </select>
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">{form.type === "Percentage" ? "Phần trăm giảm (%)" : "Số tiền giảm (đ)"} *</label>
                <input className="ops-form-input" type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Đơn tối thiểu (đ)</label>
                <input className="ops-form-input" type="number" value={form.minOrderAmount ?? ""} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Giảm tối đa (đ)</label>
                <input className="ops-form-input" type="number" value={form.maxDiscountAmount ?? ""} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="ops-form-group">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.isFlashSale} onChange={(e) => setForm({ ...form, isFlashSale: e.target.checked })} />
                  <span className="ops-form-label" style={{ margin: 0 }}>Flash sale</span>
                </label>
              </div>
              <div className="ops-form-group">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <span className="ops-form-label" style={{ margin: 0 }}>Đang hoạt động</span>
                </label>
              </div>
            </div>
            <div className="ops-modal-footer">
              <button className="ops-btn ops-btn--ghost" onClick={() => setShowForm(false)} type="button">Hủy</button>
              <button className="ops-btn ops-btn--primary" disabled={isSaving} onClick={handleSave} type="button">
                {isSaving ? "Đang lưu..." : editingId ? "Cập nhật" : "Tạo mới"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <table className="ops-table">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Tên</th>
            <th>Giảm</th>
            <th>Đơn tối thiểu</th>
            <th>Loại</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {promotions.map((promotion) => (
            <tr key={promotion.promotionId}>
              <td><strong>{promotion.code}</strong></td>
              <td>{promotion.name}</td>
              <td>{promotion.type === "Percentage" ? `${promotion.discountValue}%` : formatVnd(promotion.discountValue)}</td>
              <td>{formatVnd(promotion.minOrderAmount)}</td>
              <td>{promotion.isFlashSale ? <span className="ops-badge ops-badge--preparing">Flash sale</span> : "Thường"}</td>
              <td>
                <span className={`ops-badge ${promotion.isActive ? "ops-badge--ready" : "ops-badge--cancelled"}`}>
                  {promotion.isActive ? "Hoạt động" : "Tắt"}
                </span>
              </td>
              <td>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => openEdit(promotion)} type="button">Sửa</button>
                  <button className="ops-btn ops-btn--danger ops-btn--sm" onClick={() => handleDelete(promotion.promotionId)} type="button">Xóa</button>
                </div>
              </td>
            </tr>
          ))}
          {promotions.length === 0 ? (
            <tr><td colSpan={7}><div className="ops-empty">Chưa có khuyến mãi</div></td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
