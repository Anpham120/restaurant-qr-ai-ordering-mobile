import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@cmc/auth";
import { AdminInvoicesPanel } from "../AdminInvoicesPage";
import { StaffPaymentsPage } from "../StaffPaymentsPage";
import { CounterShiftPanel } from "./CounterShiftPanel";
import { CounterVoucherPanel } from "./CounterVoucherPanel";
import { OpsHubShell } from "../../components/operations/OpsHubShell";
import { OpsAssistancePanel } from "../../components/operations/OpsAssistancePanel";
import { useOpsAssistance } from "../../components/operations/OpsAssistanceProvider";
import { useOpsHubTab } from "../../components/operations/OpsHubTabs";
import { useOpsConnectionStatus } from "../../components/operations/OpsRealtimeProvider";
import { hasPendingCounterPayments } from "../../services/opsSummaryService";
import "../../components/operations/operations.css";
import "./counter-hub.css";

const COUNTER_STAFF_TABS = [
  { id: "shift", label: "Ca làm việc" },
  { id: "vouchers", label: "Phiếu tặng món" },
  { id: "assistance", label: "Gọi nhân viên" },
  { id: "payments", label: "Chờ thanh toán" },
  { id: "invoices", label: "Lịch sử hóa đơn" },
];

const COUNTER_SUPERVISOR_TABS = [
  { id: "shift", label: "Giám sát ca" },
  { id: "invoices", label: "Lịch sử hóa đơn" },
];

export function CounterHubPage() {
  const { user } = useAuth();
  const isSupervisor = user?.role === "Admin";
  const counterTabs = isSupervisor ? COUNTER_SUPERVISOR_TABS : COUNTER_STAFF_TABS;
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeTab } = useOpsHubTab(counterTabs);
  const connectionStatus = useOpsConnectionStatus();
  const { recentAssistance } = useOpsAssistance();

  useEffect(() => {
    if (isSupervisor || searchParams.get("tab")) return;
    let active = true;
    void hasPendingCounterPayments()
      .then((hasPending) => {
        if (!active || !hasPending) return;
        setSearchParams({ tab: "payments" }, { replace: true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isSupervisor, searchParams, setSearchParams]);

  return (
    <OpsHubShell
      className="ops-hub-shell--counter"
      title={isSupervisor ? "Giám sát quầy" : "Quầy thu ngân"}
      description={isSupervisor
        ? "Xem tiền theo ca và lịch sử hóa đơn — không thao tác thu/chốt ca tại đây."
        : "Mở ca, thu tiền và tra cứu hóa đơn phiên bàn."}
      tabs={counterTabs}
      connectionStatus={connectionStatus}
    >
      {activeTab === "shift" ? <CounterShiftPanel embedded supervisorMode={isSupervisor} /> : null}
      {activeTab === "vouchers" ? <CounterVoucherPanel /> : null}
      {activeTab === "assistance" ? (
        <OpsAssistancePanel
          emptyLabel="Chưa có bàn nào gọi nhân viên trong phiên này."
          title="Yêu cầu gọi nhân viên"
          items={recentAssistance}
        />
      ) : null}
      {activeTab === "payments" ? <StaffPaymentsPage embedded /> : null}
      {activeTab === "invoices" ? <AdminInvoicesPanel embedded /> : null}
    </OpsHubShell>
  );
}
