import { useCallback, useEffect, useState } from "react";
import type { AdminCategory, AdminCategoryRequest } from "@cmc/shared-types";
import { api } from "../../services/apiClient";
import { Folder, X } from "lucide-react";
import "../operations/operations.css";
import { useOpsConfirm } from "../operations/OpsConfirmProvider";

const EMPTY: AdminCategoryRequest = { name: "", displayOrder: 0, isActive: true };

export function AdminCategoryManager({ embedded = false }: { embedded?: boolean }) {
  const confirm = useOpsConfirm();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminCategoryRequest>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.categories.list();
      setCategories(data);
    } catch {
      setError("Không tải được danh mục.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(cat: AdminCategory) {
    setEditingId(cat.categoryId);
    setForm({ name: cat.name, displayOrder: cat.displayOrder, isActive: cat.isActive });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setNotice("Tên danh mục không được trống."); return; }
    setIsSaving(true);
    setNotice("");
    try {
      if (editingId) {
        await api.categories.update(editingId, form);
        setNotice("Đã cập nhật.");
      } else {
        await api.categories.create(form);
        setNotice("Đã tạo danh mục.");
      }
      setShowForm(false);
      await load();
    } catch {
      setNotice("Lưu thất bại.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: "Xoá danh mục này?",
      message: "Món thuộc danh mục sẽ không còn được nhóm theo nó nữa.",
      confirmLabel: "Xoá danh mục",
      danger: true,
    }))) return;
    try {
      await api.categories.delete(id);
      setNotice("Đã xóa.");
      await load();
    } catch {
      setNotice("Xóa thất bại (có thể còn món trong danh mục).");
    }
  }

  if (isLoading) return <div className="ops-empty"><div className="ops-empty-icon"><Folder aria-hidden="true" /></div>Đang tải...</div>;

  return (
    <div>
      {!embedded ? (
        <div className="ops-page-header">
          <h1>Danh mục</h1>
          <p>Quản lý danh mục thực đơn</p>
        </div>
      ) : null}

      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className="ops-toolbar">
        <button className="ops-btn ops-btn--primary" onClick={openCreate} type="button">+ Thêm danh mục</button>
      </div>

      {showForm ? (
        <div className="ops-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <h2>{editingId ? "Sửa danh mục" : "Thêm danh mục"}</h2>
              <button aria-label="Đóng" className="ops-modal-close" onClick={() => setShowForm(false)} type="button"><X aria-hidden="true" size={18} /></button>
            </div>
            <div className="ops-modal-body">
              <div className="ops-form-group">
                <label className="ops-form-label">Tên *</label>
                <input className="ops-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label">Thứ tự hiển thị</label>
                <input className="ops-form-input" type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} />
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
            <th>Tên</th>
            <th>Thứ tự</th>
            <th>Trạng thái</th>
            <th>Ngày tạo</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.categoryId}>
              <td><strong>{cat.name}</strong></td>
              <td>{cat.displayOrder}</td>
              <td>
                <span className={`ops-badge ${cat.isActive ? "ops-badge--ready" : "ops-badge--cancelled"}`}>
                  {cat.isActive ? "Hoạt động" : "Tắt"}
                </span>
              </td>
              <td style={{ fontSize: 12, color: "var(--color-muted)" }}>{new Date(cat.createdAt).toLocaleDateString("vi-VN")}</td>
              <td>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => openEdit(cat)} type="button">Sửa</button>
                  <button className="ops-btn ops-btn--danger ops-btn--sm" onClick={() => handleDelete(cat.categoryId)} type="button">Xóa</button>
                </div>
              </td>
            </tr>
          ))}
          {categories.length === 0 ? (
            <tr><td colSpan={5}><div className="ops-empty">Chưa có danh mục</div></td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
