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
import { phutDaCho } from "../../components/operations/opsAssistanceQueue";
import { BellRing, Radio } from "lucide-react";
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
  const { recentAssistance, daDieuPhoiYeuCau } = useOpsAssistance();

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
      {/*
        DẢI ĐIỀU PHỐI — nằm NGOÀI mọi tab, thấy được kể cả khi đang thu tiền ở tab khác.

        Nghiệp vụ: phục vụ bàn không cầm điện thoại, họ nhận lệnh qua bộ đàm. Quầy là điểm điều
        phối — nhận yêu cầu của khách, bấm bộ đàm, cử người tới bàn.

        Việc này ĐÃ có thông báo nổi (OpsToastProvider), nhưng thông báo đó tự tắt sau 5 GIÂY. Đủ
        cho một tin "có đơn mới"; quá ngắn cho một việc phải làm. Người ở quầy đang đếm tiền cho
        khách khác thì 5 giây trôi qua trước khi họ ngẩng lên, và yêu cầu rơi lại vào một tab bị
        động mà không ai đang mở.

        Nên dải này KHÔNG tự tắt: nó chỉ mất khi có người bấm "Đã điều phối", tức khi đã thật sự
        bấm bộ đàm. Số phút chờ hiện kèm vì đó là thứ quyết định bàn nào đi trước khi nhiều bàn
        cùng gọi — và là con số người đang bận không tự tính được.
      */}
      {recentAssistance.length > 0 ? (
        <section aria-live="assertive" className="counter-dispatch" role="status">
          <h2><BellRing aria-hidden="true" size={16} /> Bàn đang gọi nhân viên</h2>
          <ul>
            {recentAssistance.map((yc) => (
              <li key={yc.id}>
                <strong>Bàn {yc.tableCode}</strong>
                <span className="counter-dispatch-wait">
                  {phutDaCho(yc.requestedAt) === 0
                    ? "vừa gọi"
                    : `chờ ${phutDaCho(yc.requestedAt)} phút`}
                </span>
                {yc.note && yc.note !== "Yêu cầu gọi nhân viên" ? (
                  <span className="ops-muted">{yc.note}</span>
                ) : null}
                <button
                  className="ops-btn ops-btn--primary ops-btn--sm"
                  onClick={() => daDieuPhoiYeuCau(yc.id)}
                  type="button"
                >
                  <Radio aria-hidden="true" size={14} /> Đã điều phối
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
