import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { AdminTable, AdminTableSessionSummary } from "@cmc/shared-types";
import { ApiError } from "@cmc/api-client";
import { api } from "../../services/apiClient";
import { listTableInvoices } from "../../services/orderService";
import { useOpsRealtime } from "../../hooks/useOpsRealtime";
import { FloorMapGrid } from "./FloorMapGrid";
import { TableDetailDrawer } from "./TableDetailDrawer";
import { buildTableFloorRows, type FloorMapFilter, type TableFloorRow } from "./floorMapUtils";
import { OpsConnectionBadge } from "../operations/OpsConnectionBadge";
import { OpsAssistancePanel } from "../operations/OpsAssistancePanel";
import { useOpsAssistance } from "../operations/OpsAssistanceProvider";
import { Armchair } from "lucide-react";
import "../operations/operations.css";
import "./floor-map.css";
import { useOpsConfirm } from "../operations/OpsConfirmProvider";

export function AdminTableSessionMonitor({ embedded = false }: { embedded?: boolean }) {
  const confirm = useOpsConfirm();
  const [searchParams] = useSearchParams();
  const { recentAssistance } = useOpsAssistance();
  const [tables, setTables] = useState<AdminTable[]>([]);
  const [sessions, setSessions] = useState<AdminTableSessionSummary[]>([]);
  const [pendingTableCodes, setPendingTableCodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<FloorMapFilter>("all");
  const [selectedRow, setSelectedRow] = useState<TableFloorRow | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [tableList, sessionList, invoices] = await Promise.all([
        api.tables.listAdmin(),
        api.tables.listAdminSessions(),
        listTableInvoices().catch(() => []),
      ]);
      setTables(tableList.items);
      setSessions(sessionList.items);
      setPendingTableCodes(new Set(
        invoices.filter((invoice) => invoice.status === "Pending" && invoice.tableCode)
          .map((invoice) => invoice.tableCode as string),
      ));
      setError("");
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError("Bạn cần đăng nhập với quyền Nhân viên hoặc Quản trị viên để xem phiên bàn.");
      } else {
        setError("Không tải được dữ liệu phiên bàn từ máy chủ.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { connectionStatus } = useOpsRealtime({ refresh: load, pollIntervalMs: 15_000 });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      if (!cancelled) await load();
    })();
    return () => { cancelled = true; };
  }, [load]);

  const rows = useMemo(
    () => buildTableFloorRows(tables, sessions, pendingTableCodes),
    [tables, sessions, pendingTableCodes],
  );

  const servingCount = rows.filter((row) => row.state === "serving" || row.state === "payment").length;
  const activeOrderTotal = rows.reduce((sum, row) => sum + (row.session?.activeOrderCount ?? 0), 0);

  useEffect(() => {
    const tableCode = searchParams.get("table");
    if (!tableCode) return;
    const match = rows.find((row) => row.table.tableCode === tableCode);
    if (match) setSelectedRow(match);
  }, [rows, searchParams]);

  async function handleCloseSession(sessionId: string, tableCode: string) {
    if (!(await confirm({
      title: `Đóng phiên bàn ${tableCode}?`,
      message: "Khách đang ngồi sẽ phải quét QR lại để đặt tiếp.",
      confirmLabel: "Đóng phiên",
      danger: true,
    }))) return;
    setClosingId(sessionId);
    try {
      await api.tables.closeSession(sessionId);
      setNotice(`Đã đóng phiên bàn ${tableCode}.`);
      setSelectedRow(null);
      await load();
    } catch {
      setNotice(`Không đóng được phiên bàn ${tableCode}. Vui lòng thử lại.`);
    } finally {
      setClosingId(null);
    }
  }

  if (isLoading) {
    return <div className="ops-empty"><div className="ops-empty-icon"><Armchair aria-hidden="true" /></div>Đang tải phiên bàn...</div>;
  }

  return (
    <div>
      {!embedded ? (
        <div className="ops-page-header">
          <div className="ops-page-header-row">
            <div>
              <h1>Phiên bàn</h1>
              <p>Theo dõi {tables.length} bàn theo thời gian thực trên sơ đồ phòng ăn.</p>
            </div>
            <OpsConnectionBadge status={connectionStatus} />
          </div>
        </div>
      ) : null}

      {error ? <div className="ops-notice ops-notice--danger">{error}</div> : null}
      {notice ? <div className="ops-notice ops-notice--info">{notice}</div> : null}

      {embedded ? <OpsAssistancePanel items={recentAssistance} /> : null}

      <div className="ops-stats">
        <div className="ops-stat-card">
          <div className="ops-stat-label">Tổng số bàn</div>
          <div className="ops-stat-value">{tables.length}</div>
        </div>
        <div className="ops-stat-card">
          <div className="ops-stat-label">Đang phục vụ</div>
          <div className="ops-stat-value ts-value--serving">{servingCount}</div>
        </div>
        <div className="ops-stat-card">
          <div className="ops-stat-label">Bàn trống</div>
          <div className="ops-stat-value">{rows.filter((row) => row.state === "free").length}</div>
        </div>
        <div className="ops-stat-card">
          <div className="ops-stat-label">Đơn đang xử lý</div>
          <div className="ops-stat-value ts-value--orders">{activeOrderTotal}</div>
        </div>
      </div>

      {lastUpdatedAt ? (
        <p className="ts-last-updated">
          Cập nhật lúc {lastUpdatedAt.toLocaleTimeString("vi-VN")}
          {connectionStatus === "connected" ? " · realtime" : " · tự làm mới khi mất kết nối"}
        </p>
      ) : null}

      <FloorMapGrid
        rows={rows}
        filter={filter}
        onFilterChange={setFilter}
        onSelect={setSelectedRow}
        selectedTableCode={selectedRow?.table.tableCode ?? null}
      />

      <TableDetailDrawer
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onCloseSession={handleCloseSession}
        closingSessionId={closingId}
      />
    </div>
  );
}
