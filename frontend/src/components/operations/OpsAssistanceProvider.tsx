import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { daDieuPhoi, themYeuCau } from "./opsAssistanceQueue";

export type OpsAssistanceAlert = {
  id: string;
  tableCode: string;
  tableSessionId: string | null;
  note: string | null;
  requestedAt: string;
};

type OpsAssistanceContextValue = {
  recentAssistance: OpsAssistanceAlert[];
  recordAssistance: (alert: Omit<OpsAssistanceAlert, "id">) => void;
  /** Quầy đã bấm bộ đàm cử người tới bàn — bỏ yêu cầu khỏi hàng chờ điều phối. */
  daDieuPhoiYeuCau: (id: string) => void;
};

const OpsAssistanceContext = createContext<OpsAssistanceContextValue>({
  recentAssistance: [],
  recordAssistance: () => {},
  daDieuPhoiYeuCau: () => {},
});

export function OpsAssistanceProvider({ children }: { children: ReactNode }) {
  const [recentAssistance, setRecentAssistance] = useState<OpsAssistanceAlert[]>([]);

  const recordAssistance = useCallback((alert: Omit<OpsAssistanceAlert, "id">) => {
    const id = `${alert.tableCode}-${alert.requestedAt}`;
    setRecentAssistance((current) => themYeuCau(current, { ...alert, id }));
  }, []);

  const daDieuPhoiYeuCau = useCallback((id: string) => {
    setRecentAssistance((current) => daDieuPhoi(current, id));
  }, []);

  const value = useMemo(
    () => ({ recentAssistance, recordAssistance, daDieuPhoiYeuCau }),
    [recentAssistance, recordAssistance, daDieuPhoiYeuCau],
  );

  return (
    <OpsAssistanceContext.Provider value={value}>
      {children}
    </OpsAssistanceContext.Provider>
  );
}

export function useOpsAssistance() {
  return useContext(OpsAssistanceContext);
}
