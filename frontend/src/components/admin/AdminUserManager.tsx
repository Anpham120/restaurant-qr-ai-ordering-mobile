import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@cmc/auth";
import type { UserSummary, UserRole } from "@cmc/shared-types";
import { ApiError } from "@cmc/api-client";
import { Eye, EyeOff, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { api } from "../../services/apiClient";
import "../operations/operations.css";
import { useOpsConfirm } from "../operations/OpsConfirmProvider";

const ASSIGNABLE_ROLES: UserRole[] = ["Admin", "CounterStaff", "Kitchen"];

const ROLE_LABELS: Record<string, string> = {
  Staff: "Nhân viên phục vụ (cũ)",
  CounterStaff: "Nhân viên quầy",
  Kitchen: "Nhân viên bếp",
  Admin: "Quản trị viên",
  Customer: "Khách hàng",
};

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: "Email này đã được đăng ký. Vui lòng dùng email khác.",
  EMAIL_INVALID: "Email không hợp lệ.",
  PASSWORD_TOO_SHORT: "Mật khẩu phải có ít nhất 8 ký tự.",
  FULL_NAME_REQUIRED: "Họ tên không được để trống.",
  ROLE_INVALID: "Vai trò tài khoản không hợp lệ.",
  USER_NOT_FOUND: "Không tìm thấy tài khoản.",
  CANNOT_DELETE_CURRENT_USER: "Bạn không thể xóa tài khoản đang đăng nhập.",
  CANNOT_REMOVE_OWN_ADMIN_ROLE: "Bạn không thể tự gỡ quyền Quản trị viên của tài khoản đang đăng nhập.",
  USER_HAS_DEPENDENCIES: "Không xóa được vì tài khoản còn liên kết ca quầy. Hệ thống đã thử chuyển tham chiếu; thử lại hoặc liên hệ kỹ thuật.",
  HTTP_401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  HTTP_403: "Bạn không có quyền thực hiện thao tác này (chỉ Admin).",
};

function translateError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return ERROR_MESSAGES[err.code] ?? `${fallback} (${err.code})`;
  }
  return fallback;
}

function normalizeAssignableRole(role: UserRole): UserRole {
  if (role === "Staff") return "CounterStaff";
  return ASSIGNABLE_ROLES.includes(role) ? role : "CounterStaff";
}

type UserForm = { fullName: string; email: string; password: string; role: UserRole };

const EMPTY: UserForm = { fullName: "", email: "", password: "", role: "CounterStaff" };

type OpsPasswordInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
};

function OpsPasswordInput({ id, label, value, onChange, autoComplete = "new-password" }: OpsPasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="ops-form-group">
      <label className="ops-form-label" htmlFor={id}>{label}</label>
      <div className="ops-password-input-wrap">
        <input
          id={id}
          autoComplete={autoComplete}
          className="ops-form-input"
          onChange={(e) => onChange(e.target.value)}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          className="ops-password-toggle"
          onClick={() => setVisible((v) => !v)}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
        </button>
      </div>
    </div>
  );
}

export function AdminUserManager() {
  const confirm = useOpsConfirm();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await api.users.list();
      setUsers(data.users);
    } catch {
      setError("Không tải được danh sách người dùng.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  function openCreateForm() {
    setEditingUser(null);
    setForm(EMPTY);
    setConfirmPassword("");
    setNotice("");
    setShowForm(true);
  }

  function openEditForm(user: UserSummary) {
    setEditingUser(user);
    setForm({
      fullName: user.fullName,
      email: user.email,
      password: "",
      role: normalizeAssignableRole(user.role),
    });
    setConfirmPassword("");
    setNotice("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingUser(null);
    setConfirmPassword("");
  }

  async function handleSave() {
    if (!form.fullName.trim()) {
      setNotice("Vui lòng nhập họ tên.");
      return;
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      setNotice("Vui lòng nhập email hợp lệ.");
      return;
    }
    if (!editingUser) {
      if (form.password.length < 8) {
        setNotice("Mật khẩu phải có ít nhất 8 ký tự.");
        return;
      }
      if (form.password !== confirmPassword) {
        setNotice("Mật khẩu xác nhận không khớp.");
        return;
      }
    }
    setIsSaving(true);
    setNotice("");
    try {
      if (editingUser) {
        // Vá bằng phản hồi của máy chủ thay vì `load()`: một lần sửa tên không đáng kéo lại cả
        // danh sách tài khoản, và trong lúc kéo thì bảng hiện dữ liệu cũ.
        const updated = await api.users.update(editingUser.userId, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          role: form.role,
        });
        setUsers((prev) => prev.map((u) => (u.userId === updated.userId ? updated : u)));
        setNotice(`Đã cập nhật tài khoản ${form.email.trim()}.`);
      } else {
        const created = await api.users.create({
          ...form,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
        });
        // Nối vào CUỐI, và đây là chỗ cần nói rõ: `GET /api/users` gọi `findAll()` KHÔNG có
        // `ORDER BY`, nên thứ tự do Postgres quyết và không có vị trí nào là "đúng". Nối vào cuối
        // không tệ hơn bất kỳ lựa chọn nào khác — nhưng nó cũng có nghĩa là danh sách có thể tự
        // xáo lại giữa hai lần tải, và đó là chuyện của backend chứ không sửa được ở đây.
        setUsers((prev) => [...prev, created]);
        setNotice(`Đã tạo tài khoản ${ROLE_LABELS[form.role] ?? form.role} cho ${form.email.trim()}.`);
      }
      closeForm();
    } catch (err) {
      setNotice(translateError(err, editingUser ? "Cập nhật tài khoản thất bại." : "Tạo tài khoản thất bại."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(user: UserSummary) {
    if (!(await confirm({
      title: "Xoá tài khoản này?",
      message: `${user.email} sẽ mất quyền đăng nhập ngay. Thao tác này không hoàn tác được.`,
      confirmLabel: "Xoá tài khoản",
      danger: true,
      requireText: user.email,
    }))) return;
    setDeletingId(user.userId);
    setNotice("");
    try {
      await api.users.delete(user.userId);
      // `delete` trả về rỗng nên không có gì để vá vào — bỏ đúng dòng vừa xoá là đủ, và đó cũng là
      // thứ duy nhất thay đổi.
      setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
      setNotice(`Đã xóa tài khoản ${user.email}.`);
    } catch (err) {
      setNotice(translateError(err, "Xóa tài khoản thất bại."));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResetPassword(userId: string) {
    if (newPassword.length < 8) {
      setNotice("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmResetPassword) {
      setNotice("Mật khẩu xác nhận không khớp.");
      return;
    }
    try {
      await api.users.resetPassword(userId, { newPassword });
      setNotice("Đã đặt lại mật khẩu.");
      setResetId(null);
      setNewPassword("");
      setConfirmResetPassword("");
      setShowResetPassword(false);
    } catch (err) {
      setNotice(translateError(err, "Đặt lại mật khẩu thất bại."));
    }
  }

  if (isLoading) return <div className="ops-empty"><div className="ops-empty-icon"><Users aria-hidden="true" /></div>Đang tải...</div>;

  return (
    <div>
      <div className="ops-page-header">
        <h1>Người dùng</h1>
        <p>Thêm, sửa, xóa tài khoản, phân quyền và đặt lại mật khẩu</p>
      </div>

      <div className="ops-notice ops-notice--info" style={{ marginBottom: "1rem" }}>
        <strong>Phạm vi vai trò:</strong> Chỉ <strong>Quản trị viên</strong>, <strong>Nhân viên quầy</strong> và <strong>Nhân viên bếp</strong>. Tài khoản vai trò cũ (phục vụ/khách) vẫn hiển thị — nên sửa sang quầy hoặc xóa.
      </div>

      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className="ops-toolbar">
        <div className="ops-toolbar-search">
          <input className="ops-form-input" placeholder="Tìm theo tên, email, vai trò..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="ops-btn ops-btn--primary" onClick={openCreateForm} type="button">
          <Plus aria-hidden="true" size={16} /> Tạo tài khoản
        </button>
      </div>

      {showForm ? (
        <div className="ops-modal-overlay" onClick={closeForm}>
          <div
            aria-labelledby="user-form-title"
            aria-modal="true"
            className="ops-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="ops-modal-header">
              <h2 id="user-form-title">{editingUser ? "Sửa tài khoản" : "Tạo tài khoản"}</h2>
              <button aria-label="Đóng" className="ops-modal-close" onClick={closeForm} type="button"><X aria-hidden="true" size={18} /></button>
            </div>
            <div className="ops-modal-body">
              <div className="ops-form-group">
                <label className="ops-form-label" htmlFor="create-user-full-name">Họ tên *</label>
                <input id="create-user-full-name" className="ops-form-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="ops-form-group">
                <label className="ops-form-label" htmlFor="create-user-email">Email *</label>
                <input id="create-user-email" className="ops-form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              {!editingUser ? (
                <>
                  <OpsPasswordInput
                    id="create-user-password"
                    label="Mật khẩu * (tối thiểu 8 ký tự)"
                    onChange={(password) => setForm({ ...form, password })}
                    value={form.password}
                  />
                  <OpsPasswordInput
                    id="create-user-password-confirm"
                    label="Xác nhận mật khẩu *"
                    onChange={setConfirmPassword}
                    value={confirmPassword}
                  />
                </>
              ) : null}
              <div className="ops-form-group">
                <label className="ops-form-label" htmlFor="create-user-role">Vai trò</label>
                <select id="create-user-role" className="ops-form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                </select>
                {editingUser && (editingUser.role === "Staff" || editingUser.role === "Customer") ? (
                  <p className="ops-form-error" style={{ marginTop: 8 }}>
                    Vai trò hiện tại là {ROLE_LABELS[editingUser.role]}. Lưu để chuyển sang vai trò mới ở trên.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="ops-modal-footer">
              <button className="ops-btn ops-btn--ghost" onClick={closeForm} type="button">Hủy</button>
              <button className="ops-btn ops-btn--primary" disabled={isSaving} onClick={handleSave} type="button">
                {isSaving ? "Đang lưu..." : editingUser ? "Lưu thay đổi" : "Tạo tài khoản"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <table className="ops-table">
        <thead>
          <tr>
            <th>Họ tên</th>
            <th>Email</th>
            <th>Vai trò</th>
            <th>Ngày tạo</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((user) => (
            <tr key={user.userId}>
              <td><strong>{user.fullName}</strong></td>
              <td>{user.email}</td>
              <td>
                <span className={`ops-badge ops-badge--${user.role === "Admin" ? "placed" : user.role === "Staff" ? "served" : user.role === "Kitchen" ? "preparing" : "ready"}`}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </td>
              <td style={{ fontSize: 12, color: "var(--color-muted)" }}>{new Date(user.createdAt).toLocaleDateString("vi-VN")}</td>
              <td>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {resetId === user.userId ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", maxWidth: 320 }}>
                    <input
                      className="ops-form-input"
                      type={showResetPassword ? "text" : "password"}
                      placeholder="Mật khẩu mới"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={{ width: 120, padding: "4px 8px", fontSize: 12 }}
                    />
                    <input
                      className="ops-form-input"
                      type={showResetPassword ? "text" : "password"}
                      placeholder="Xác nhận"
                      value={confirmResetPassword}
                      onChange={(e) => setConfirmResetPassword(e.target.value)}
                      style={{ width: 120, padding: "4px 8px", fontSize: 12 }}
                    />
                    <button
                      aria-label={showResetPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      className="ops-btn ops-btn--ghost ops-btn--sm"
                      onClick={() => setShowResetPassword((v) => !v)}
                      type="button"
                    >
                      {showResetPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button className="ops-btn ops-btn--primary ops-btn--sm" onClick={() => handleResetPassword(user.userId)} type="button">Lưu</button>
                    <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => { setResetId(null); setNewPassword(""); setConfirmResetPassword(""); setShowResetPassword(false); }} type="button">Hủy</button>
                  </div>
                ) : (
                  <>
                    <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => openEditForm(user)} type="button">
                      <Pencil aria-hidden="true" size={14} /> Sửa
                    </button>
                    <button className="ops-btn ops-btn--ghost ops-btn--sm" onClick={() => { setResetId(user.userId); setNewPassword(""); setConfirmResetPassword(""); setShowResetPassword(false); }} type="button">
                      Reset mật khẩu
                    </button>
                    <button
                      className="ops-btn ops-btn--danger ops-btn--sm"
                      disabled={deletingId === user.userId || currentUser?.userId === user.userId}
                      onClick={() => void handleDelete(user)}
                      title={currentUser?.userId === user.userId ? "Không thể xóa tài khoản đang đăng nhập" : "Xóa tài khoản"}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={14} /> {deletingId === user.userId ? "Đang xóa..." : "Xóa"}
                    </button>
                  </>
                )}
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 ? <tr><td colSpan={5}><div className="ops-empty">Không tìm thấy</div></td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
