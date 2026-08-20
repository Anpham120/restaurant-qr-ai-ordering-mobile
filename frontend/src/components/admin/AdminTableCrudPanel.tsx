import { useCallback, useEffect, useState } from "react";
import type { AdminTable } from "@cmc/shared-types";
import { ApiError } from "@cmc/api-client";
import { api } from "../../services/apiClient";
import { Plus, RefreshCw } from "lucide-react";
import "../operations/operations.css";
import { useOpsConfirm } from "../operations/OpsConfirmProvider";

type TableForm = {
  tableCode: string;
  displayName: string;
};

const EMPTY_FORM: TableForm = { tableCode: "", displayName: "" };

const ERROR_MESSAGES: Record<string, string> = {
  TABLE_CODE_EXISTS: "Mã bàn đã tồn tại.",
  TABLE_CODE_INVALID: "Mã bàn phải theo định dạng T01.",
  TABLE_CAPACITY_REACHED: "Đã dùng hết mã bàn khả dụng (T01–T99).",
  TABLE_SESSION_OPEN: "Đóng phiên bàn trước khi tắt bàn hoặc tạo lại QR.",
  TABLE_INVOICE_PAYMENT_PENDING: "Hoàn tất hoặc hủy hóa đơn chờ thu trước khi thao tác.",
  TABLE_NOT_FOUND: "Không tìm thấy bàn.",
};

function translateError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return ERROR_MESSAGES[error.code] ?? error.message ?? fallback;
  }
  return fallback;
}

export function AdminTableCrudPanel() {
  const confirm = useOpsConfirm();
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TableForm>(EMPTY_FORM);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.tables.listAdmin();
      setTables(response.items);
      setError("");
    } catch {
      setError("Không tải được danh sách bàn.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    try {
      const created = await api.tables.createAdmin({
        tableCode: form.tableCode.trim() || null,
        displayName: form.displayName.trim(),
      });
      // Chèn theo THỨ TỰ chứ không nối vào cuối: máy chủ trả danh sách sắp theo mã bàn
      // (`findAllByOrderByTableCodeAsc`), nên nối vào cuối sẽ khiến bàn mới nhảy chỗ ngay lần tải
      // sau — người dùng thấy nó "tự di chuyển" mà không hiểu vì sao.
      //
      // Máy chủ tự sinh mã bàn khi để trống, nên `created.tableCode` là thứ duy nhất đáng tin để
      // sắp — không dùng được giá trị trong form.
      setTables((prev) => [...prev, created].sort((a, b) => a.tableCode.localeCompare(b.tableCode)));
      setShowForm(false);
      setForm(EMPTY_FORM);
      setNotice("Đã thêm bàn mới.");
    } catch (err) {
      setNotice(translateError(err, "Không thêm được bàn."));
    }
  }

  async function handleSaveName(tableCode: string) {
    setBusyCode(tableCode);
    setNotice("");
    try {
      // Vá bằng CHÍNH phản hồi của máy chủ thay vì gọi lại `load()`.
      //
      // `load()` kéo lại toàn bộ danh sách bàn cho một lần sửa tên: bảng nhấp nháy, và trong lúc
      // đó người dùng nhìn dữ liệu cũ. Endpoint đã trả về `AdminTable` sau khi sửa, nên dùng nó
      // vừa nhanh hơn vừa CHÍNH XÁC hơn việc tự dựng lại đối tượng từ giá trị vừa gõ — máy chủ có
      // thể chuẩn hoá tên, và `updatedAt` chỉ nó mới biết.
      const updated = await api.tables.updateAdmin(tableCode, { displayName: editName.trim() });
      setTables((prev) => prev.map((t) => (t.tableCode === tableCode ? updated : t)));
      setEditingCode(null);
      setNotice(`Đã cập nhật bàn ${tableCode}.`);
    } catch (err) {
      setNotice(translateError(err, "Không cập nhật được bàn."));
    } finally {
      setBusyCode(null);
    }
  }

  async function handleToggleActive(table: AdminTable) {
    setBusyCode(table.tableCode);
    setNotice("");
    try {
      const updated = await api.tables.updateAdmin(table.tableCode, { isActive: !table.isActive });
      setTables((prev) => prev.map((t) => (t.tableCode === table.tableCode ? updated : t)));
      setNotice(table.isActive ? `Đã tắt bàn ${table.tableCode}.` : `Đã bật lại bàn ${table.tableCode}.`);
    } catch (err) {
      setNotice(translateError(err, "Không đổi trạng thái bàn."));
    } finally {
      setBusyCode(null);
    }
  }

  async function handleRotateQr(table: AdminTable) {
    if (!(await confirm({
      title: `Tạo lại QR cho bàn ${table.tableCode}?`,
      message: "Mã QR đang dán trên bàn sẽ ngừng hoạt động ngay. Phải in và dán mã mới.",
      confirmLabel: "Tạo mã mới",
      danger: true,
      requireText: table.tableCode,
    }))) return;
    setBusyCode(table.tableCode);
    setNotice("");
    try {
      // Ở đây phản hồi là BẮT BUỘC chứ không chỉ tiện: mã QR mới do máy chủ sinh, giao diện
      // không có cách nào tự biết. Đoán rồi hiển thị sẽ cho nhân viên một mã QR sai để dán lên bàn.
      const updated = await api.tables.rotateQr(table.tableCode);
      setTables((prev) => prev.map((t) => (t.tableCode === table.tableCode ? updated : t)));
      setNotice(`Đã tạo lại QR cho bàn ${table.tableCode}.`);
    } catch (err) {
      setNotice(translateError(err, "Không tạo lại được QR."));
    } finally {
      setBusyCode(null);
    }
  }

  if (isLoading) {
    return <div className="ops-empty">Đang tải danh sách bàn...</div>;
  }

  return (
    <div className="ops-table-crud">
      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      <div className="ops-toolbar">
        <button className="ops-btn ops-btn--primary" type="button" onClick={() => setShowForm(true)}>
          <Plus size={16} aria-hidden="true" /> Thêm bàn
        </button>
      </div>

      {showForm ? (
        <form className="ops-form-card" onSubmit={handleCreate}>
          <h2>Thêm bàn mới</h2>
          <div className="ops-form-group">
            <label className="ops-form-label" htmlFor="table-code">Mã bàn (tùy chọn)</label>
            <input
              id="table-code"
              className="ops-form-input"
              placeholder="T31 — để trống để tự gán"
              value={form.tableCode}
              onChange={(event) => setForm({ ...form, tableCode: event.target.value.toUpperCase() })}
            />
          </div>
          <div className="ops-form-group">
            <label className="ops-form-label" htmlFor="table-name">Tên hiển thị</label>
            <input
              id="table-name"
              className="ops-form-input"
              required
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            />
          </div>
          <div className="ops-form-actions">
            <button className="ops-btn ops-btn--primary" type="submit">Lưu</button>
            <button className="ops-btn ops-btn--ghost" type="button" onClick={() => setShowForm(false)}>Hủy</button>
          </div>
        </form>
      ) : null}

      <table className="ops-table">
        <thead>
          <tr>
            <th>Mã bàn</th>
            <th>Tên hiển thị</th>
            <th>Trạng thái</th>
            <th>QR</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table) => (
            <tr key={table.tableCode}>
              <td><strong>{table.tableCode}</strong></td>
              <td>
                {editingCode === table.tableCode ? (
                  <input
                    className="ops-form-input"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                ) : (
                  table.displayName
                )}
              </td>
              <td>
                <span className={`ops-badge ${table.isActive ? "ops-badge--confirmed" : "ops-badge--cancelled"}`}>
                  {table.isActive ? "Hoạt động" : "Tạm ngưng"}
                </span>
              </td>
              <td>{table.qrToken ? "Đã cấu hình" : "Chưa có"}</td>
              <td>
                <div className="ops-inline-actions">
                  {editingCode === table.tableCode ? (
                    <>
                      <button
                        className="ops-btn ops-btn--primary ops-btn--sm"
                        disabled={busyCode === table.tableCode}
                        type="button"
                        onClick={() => void handleSaveName(table.tableCode)}
                      >
                        Lưu
                      </button>
                      <button className="ops-btn ops-btn--ghost ops-btn--sm" type="button" onClick={() => setEditingCode(null)}>
                        Hủy
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="ops-btn ops-btn--ghost ops-btn--sm"
                        type="button"
                        onClick={() => {
                          setEditingCode(table.tableCode);
                          setEditName(table.displayName);
                        }}
                      >
                        Sửa tên
                      </button>
                      <button
                        className="ops-btn ops-btn--ghost ops-btn--sm"
                        disabled={busyCode === table.tableCode}
                        type="button"
                        onClick={() => void handleToggleActive(table)}
                      >
                        {table.isActive ? "Tắt bàn" : "Bật bàn"}
                      </button>
                      <button
                        className="ops-btn ops-btn--ghost ops-btn--sm"
                        disabled={busyCode === table.tableCode}
                        type="button"
                        onClick={() => void handleRotateQr(table)}
                      >
                        <RefreshCw size={14} aria-hidden="true" /> Tạo lại QR
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
