import { useCallback, useEffect, useState } from "react";
import type { AdminMenuItem } from "../../types";
import {
  fetchAdminMenuItems,
  createAdminMenuItem,
  updateAdminMenuItem,
  deleteAdminMenuItem,
  setAdminMenuItemAvailability,
  type AdminMenuItemPayload,
} from "../../services/adminMenuService";
import { ApiError } from "@cmc/api-client";
import type { AdminCategory } from "@cmc/shared-types";
import { resolveMenuImage, toPublicMenuImageUrl } from "../../utils/menuImages";
import { tagLabel } from "../menu/MenuItemCard";
import { api } from "../../services/apiClient";
import { ClipboardList, Utensils, X } from "lucide-react";
import "../operations/operations.css";
import "./admin-menu-cards.css";

const formatVnd = (v: number) => v.toLocaleString("vi-VN") + "đ";

function toDisplayImageUrl(imageUrl: string | null | undefined): string | null {
  return toPublicMenuImageUrl(imageUrl);
}

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  CATEGORY_INVALID: "Danh mục không hợp lệ hoặc đã ngừng hoạt động. Vui lòng chọn danh mục khác.",
  MENU_ITEM_PRICE_INVALID: "Giá món phải lớn hơn 0.",
  MENU_ITEM_NAME_REQUIRED: "Tên món không được để trống.",
  MENU_ITEM_NOT_FOUND: "Không tìm thấy món này. Có thể món đã bị xóa.",
  HTTP_401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  HTTP_403: "Tài khoản của bạn không có quyền thực hiện thao tác này.",
};

function describeSaveError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return SAVE_ERROR_MESSAGES[error.code] ?? `${fallback} (${error.code})`;
  }
  return `${fallback} Vui lòng kiểm tra kết nối mạng.`;
}

const EMPTY_FORM: AdminMenuItemPayload = {
  categoryId: "",
  name: "",
  description: "",
  price: 0,
  imageUrl: "",
  isAvailable: true,
  tags: [],
};

export function AdminMenuManager({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminMenuItemPayload>(EMPTY_FORM);
  const [tagsInput, setTagsInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [menuItems, cats] = await Promise.all([
        fetchAdminMenuItems(),
        api.categories.list(),
      ]);
      setItems(menuItems);
      setCategories(cats);
    } catch {
      setError("Không tải được thực đơn.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && item.categoryId !== filterCat) return false;
    return true;
  });

  const countByCategory = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.categoryId] = (acc[item.categoryId] ?? 0) + 1;
    return acc;
  }, {});

  // Backend từ chối lưu món vào danh mục ngừng hoạt động (CATEGORY_INVALID),
  // nên dropdown chỉ hiển thị danh mục đang hoạt động.
  const activeCategories = categories.filter((c) => c.isActive !== false);
  const canCreateMenuItem = activeCategories.length > 0;

  function openCreate() {
    if (!canCreateMenuItem) {
      setNotice("Cần tạo hoặc kích hoạt ít nhất một danh mục trước khi thêm món.");
      return;
    }
    setEditingId(null);
    setForm({ ...EMPTY_FORM, categoryId: activeCategories[0]?.categoryId ?? "" });
    setTagsInput("");
    setShowForm(true);
  }

  function openEdit(item: AdminMenuItem) {
    setEditingId(item.id);
    setForm({
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl ?? "",
      isAvailable: item.isAvailable,
      tags: item.tags ?? [],
    });
    setTagsInput((item.tags ?? []).join(", "));
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.categoryId || form.price <= 0) {
      setNotice("Tên, danh mục và giá không được để trống.");
      return;
    }
    if (!activeCategories.some((category) => category.categoryId === form.categoryId)) {
      setNotice("Danh mục đã ngừng hoạt động. Hãy chọn danh mục đang hoạt động.");
      return;
    }
    setIsSaving(true);
    setNotice("");
    const payload: AdminMenuItemPayload = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      imageUrl: form.imageUrl?.trim() || null,
      tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (editingId) {
        await updateAdminMenuItem(editingId, payload);
        setNotice("Đã cập nhật.");
      } else {
        await createAdminMenuItem(payload);
        setNotice("Đã tạo món mới.");
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setNotice(describeSaveError(err, "Lưu thất bại."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xóa món này?")) return;
    try {
      await deleteAdminMenuItem(id);
      setNotice("Đã xóa.");
      await load();
    } catch (err) {
      setNotice(describeSaveError(err, "Xóa thất bại."));
    }
  }

  async function handleToggle(id: string, available: boolean) {
    try {
      await setAdminMenuItemAvailability(id, !available);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isAvailable: !available } : i)));
    } catch (err) {
      setNotice(describeSaveError(err, "Cập nhật tình trạng thất bại."));
    }
  }

  if (isLoading) {
    return <div className="ops-empty"><div className="ops-empty-icon"><ClipboardList aria-hidden="true" /></div>Đang tải...</div>;
  }

  return (
    <div>
      {!embedded ? (
        <div className="ops-page-header">
          <h1>Quản lý thực đơn</h1>
          <p>{items.length} món / {categories.length} danh mục. Hiển thị đúng như khách hàng nhìn thấy.</p>
        </div>
      ) : null}

      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className={embedded ? "amm-menu-controls" : undefined}>
      <div className="ops-toolbar">
        <div className="ops-toolbar-search">
          <input
            className="ops-form-input"
            placeholder="Tìm theo tên món..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="ops-btn ops-btn--primary"
          disabled={!canCreateMenuItem}
          onClick={openCreate}
          type="button"
        >
          + Thêm món
        </button>
      </div>
      {!canCreateMenuItem ? (
        <p className="ops-empty">Chưa có danh mục đang hoạt động. Hãy tạo hoặc kích hoạt danh mục trước khi thêm món.</p>
      ) : null}

      <div className="amm-category-tabs" role="tablist" aria-label="Danh mục thực đơn">
        <button
          type="button"
          className={`amm-chip${filterCat === "" ? " active" : ""}`}
          onClick={() => setFilterCat("")}
        >
          Tất cả ({items.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.categoryId}
            type="button"
            className={`amm-chip${filterCat === c.categoryId ? " active" : ""}`}
            onClick={() => setFilterCat(c.categoryId)}
          >
            {c.name} ({countByCategory[c.categoryId] ?? 0})
          </button>
        ))}
      </div>
      </div>

      {/* Form modal */}
      {showForm ? (
        <div className="ops-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <h2>{editingId ? "Sửa món" : "Thêm món mới"}</h2>
              <button aria-label="Đóng" className="ops-modal-close" onClick={() => setShowForm(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </div>
            <div className="ops-modal-body">
              <div className="ops-form-group">
                <label className="ops-form-label">Tên món *</label>
                <input className="ops-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Danh mục *</label>
                <select className="ops-form-select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Chọn danh mục</option>
                  {activeCategories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
                </select>
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Giá (VNĐ) *</label>
                <input className="ops-form-input" type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Mô tả</label>
                <textarea className="ops-form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">URL Ảnh</label>
                <input
                  className="ops-form-input"
                  value={form.imageUrl ?? ""}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="/menu-images/01-goi-cuon-tom-thit.webp"
                />
                <div className="ops-form-hint" style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
                  Ảnh bộ menu chuẩn nằm trong /menu-images/ (91 ảnh theo tên món). Xem trước sau khi lưu trong lưới thẻ bên dưới.
                </div>
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Tags (cách nhau dấu phẩy)</label>
                <input className="ops-form-input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="bán chạy, mới, cay" />
              </div>
              <div className="ops-form-group">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} />
                  <span className="ops-form-label" style={{ margin: 0 }}>Đang bán</span>
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

      {/* Lưới thẻ món cùng bố cục với trang thực đơn khách hàng. */}
      <div className="amm-grid">
        {filtered.map((item, index) => {
          const imageUrl = toDisplayImageUrl(resolveMenuImage(item.name, item.imageUrl, index));
          return (
            <article key={item.id} className={`amm-card${item.isAvailable ? "" : " is-off"}`}>
              <div className="amm-image-wrap">
                {imageUrl ? (
                  <img className="amm-image" src={imageUrl} alt={item.name} loading="lazy" />
                ) : (
                  <div className="amm-image-empty" aria-hidden="true"><Utensils /></div>
                )}
                <span className={`amm-availability ${item.isAvailable ? "on" : "off"}`}>
                  {item.isAvailable ? "Còn món" : "Tạm hết"}
                </span>
              </div>
              <div className="amm-content">
                <p className="amm-category">{item.categoryName}</p>
                <h3>{item.name}</h3>
                {item.description ? <p className="amm-desc">{item.description}</p> : null}
                {(item.tags ?? []).length > 0 ? (
                  <div className="amm-tags">
                    {(item.tags ?? []).slice(0, 3).map((t) => <span key={t}>{tagLabel(t)}</span>)}
                  </div>
                ) : null}
              </div>
              <footer className="amm-footer">
                <span className="amm-price">{formatVnd(item.price)}</span>
                <div className="amm-actions">
                  <button
                    className={`ops-toggle-switch ${item.isAvailable ? "ops-toggle-switch--on" : ""}`}
                    onClick={() => handleToggle(item.id, item.isAvailable)}
                    type="button"
                    title={item.isAvailable ? "Tắt bán" : "Mở bán"}
                    aria-label={item.isAvailable ? "Tắt bán" : "Mở bán"}
                  />
                  <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => openEdit(item)} type="button">Sửa</button>
                  <button className="ops-btn ops-btn--danger ops-btn--sm" onClick={() => handleDelete(item.id)} type="button">Xóa</button>
                </div>
              </footer>
            </article>
          );
        })}
        {filtered.length === 0 ? (
          <div className="ops-empty" style={{ gridColumn: "1 / -1" }}>Không tìm thấy món nào</div>
        ) : null}
      </div>
    </div>
  );
}
