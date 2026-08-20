import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@cmc/auth";
import { subscribeOrderRealtime } from "../../services/realtimeOrderService";
import type { OrderRealtimeEvent } from "../../types";
import { useOpsAssistance } from "./OpsAssistanceProvider";
import { useOpsNavBadges } from "./OpsNavBadgesProvider";
import {
  buildAssistanceToastHref,
  buildOrderCreatedToastHref,
  buildPaymentRequestedToastHref,
  resolveOpsToastHref,
} from "./opsToastRouting";
import "./operations.css";

type OpsToast = {
  id: string;
  message: string;
  href?: string;
};

type OpsToastContextValue = {
  pushToast: (message: string, href?: string) => void;
};

const OpsToastContext = createContext<OpsToastContextValue>({
  pushToast: () => {},
});

const TOAST_LABELS: Partial<Record<OrderRealtimeEvent["event"], string>> = {
  "order.created": "Có đơn mới",
  "payment.requested": "Yêu cầu thanh toán mới",
  "assistance.requested": "Khách cần hỗ trợ",
  "order.statusChanged": "Trạng thái đơn thay đổi",
};

export function OpsToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<OpsToast[]>([]);
  const { user } = useAuth();
  const { refreshBadges } = useOpsNavBadges();
  const { recordAssistance } = useOpsAssistance();
  const role = user?.role;

  const pushToast = useCallback((message: string, href?: string) => {
    const safeHref = resolveOpsToastHref(role, href);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-2), { id, message, href: safeHref }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }, [role]);

  useEffect(() => {
    const unsubscribe = subscribeOrderRealtime((event) => {
      try {
        const label = TOAST_LABELS[event.event];
        if (!label) return;
        if (role !== "Kitchen") {
          void refreshBadges();
        }
        if (event.event === "payment.requested") {
          pushToast(label, buildPaymentRequestedToastHref(role, event.payload.tableCode));
          return;
        }
        if (event.event === "order.created") {
          pushToast(label, buildOrderCreatedToastHref(role, event.payload.tableCode));
          return;
        }
        if (event.event === "assistance.requested") {
          const { tableCode, tableSessionId, note, requestedAt } = event.payload;
          recordAssistance({ tableCode, tableSessionId, note, requestedAt });
          pushToast(
            `Bàn ${tableCode} · yêu cầu gọi nhân viên`,
            buildAssistanceToastHref(role),
          );
          return;
        }
        pushToast(label);
      } catch (error) {
        // Một sự kiện realtime dị dạng không được phép làm hỏng cả trang vận hành, nên vẫn nuốt —
        // nhưng nuốt IM LẶNG thì người trực ca không có gì để báo lại khi thông báo không hiện.
        console.error("Không xử lý được sự kiện realtime cho thông báo:", event.event, error);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [pushToast, recordAssistance, refreshBadges, role]);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <OpsToastContext.Provider value={value}>
      {children}
      <div className="ops-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          toast.href ? (
            <a key={toast.id} className="ops-toast" href={toast.href}>
              {toast.message}
            </a>
          ) : (
            <div key={toast.id} className="ops-toast">{toast.message}</div>
          )
        ))}
      </div>
    </OpsToastContext.Provider>
  );
}

export function useOpsToast() {
  return useContext(OpsToastContext);
}
