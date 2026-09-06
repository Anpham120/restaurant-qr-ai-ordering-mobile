import { useEffect, useRef, type ReactNode } from "react";
import { Cloud, Minus, Plus, X, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

export function Wordmark() { return <Link className="may-brand" to="/" aria-label="Mây, thực đơn"><Cloud aria-hidden="true" strokeWidth={1.6} /><span>mây<span className="may-brand-dot">.</span></span></Link>; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; const el = dialog.current; el?.showModal(); return () => { el?.close(); prev?.focus(); }; }, []);
  return <dialog ref={dialog} className={`may-dialog ${wide ? "may-dialog-wide" : ""}`} aria-label={title} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="may-dialog-heading"><h2>{title}</h2><button className="may-icon" onClick={onClose} aria-label="Đóng"><X size={21} /></button></div>{children}
  </dialog>;
}
export function Stepper({ value, onChange, label, max = 99 }: { value: number; onChange: (n: number) => void; label: string; max?: number }) {
  return <div className="may-stepper"><button type="button" disabled={value <= 0} aria-label={`Giảm ${label}`} onClick={() => onChange(value - 1)}><Minus size={15} /></button><output aria-label={`Số lượng ${label}`}>{value}</output><button type="button" disabled={value >= max} aria-label={`Tăng ${label}`} onClick={() => onChange(value + 1)}><Plus size={15} /></button></div>;
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <div className="may-empty"><Cloud size={42} strokeWidth={1} aria-hidden="true" /><h2>{title}</h2><p>{children}</p>{action}</div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div className="may-error" role="alert"><p>{message}</p>{retry && <button type="button" className="may-link" onClick={retry}>Thử lại <ArrowUpRight size={16} /></button>}</div>; }
