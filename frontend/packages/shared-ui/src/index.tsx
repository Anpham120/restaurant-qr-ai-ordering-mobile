import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useI18n } from "@cmc/i18n";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { ApiError, createApiClient } from "@cmc/api-client";
import { authStorage, useAuth } from "@cmc/auth";
import type { UserRole } from "@cmc/shared-types";
import { Mail, Lock, Eye, EyeOff, LogIn, LogOut, ArrowLeft } from "lucide-react";

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button className={`cmc-button cmc-button--${variant}`} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`cmc-card ${className}`}>{children}</section>;
}

export function StatePanel({
  title,
  message,
  kind = "empty",
}: {
  title: string;
  message: string;
  kind?: "empty" | "loading" | "error";
}) {
  return (
    <div className={`cmc-state cmc-state--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  return <span className={`cmc-badge cmc-badge--${tone}`}>{children}</span>;
}

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <StatePanel
      title={t("Không tìm thấy trang")}
      message={t("Đường dẫn này không tồn tại trong portal hiện tại.")}
      kind="error"
    />
  );
}

export function UnauthorizedPage() {
  return (
    <StatePanel
      title="Không có quyền truy cập"
      message="Tài khoản của bạn không có vai trò phù hợp với portal này."
      kind="error"
    />
  );
}

function ChangePasswordControl() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNote(null);

    if (newPassword.length < 8) {
      setNote({ type: "error", text: "Mật khẩu mới tối thiểu 8 ký tự." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNote({ type: "error", text: "Xác nhận mật khẩu không khớp." });
      return;
    }

    setBusy(true);
    try {
      const api = createApiClient({ getAccessToken: authStorage.token });
      await api.auth.changePassword({ currentPassword, newPassword });
      reset();
      setOpen(false);
      setNote({ type: "success", text: "Đã đổi mật khẩu." });
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "CURRENT_PASSWORD_INVALID") {
        setNote({ type: "error", text: "Mật khẩu hiện tại không đúng." });
      } else {
        setNote({ type: "error", text: "Không đổi được mật khẩu. Thử lại sau." });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="cmc-account-actions">
        {note ? (
          <p className={`cmc-account-note cmc-account-note--${note.type}`} role="status">
            {note.text}
          </p>
        ) : null}
        <button
          type="button"
          className="cmc-account-trigger"
          onClick={() => {
            setNote(null);
            setOpen(true);
          }}
        >
          Đổi mật khẩu
        </button>
      </div>
    );
  }

  return (
    <form className="cmc-account-form" onSubmit={submit}>
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Mật khẩu hiện tại"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Mật khẩu mới (≥ 8 ký tự)"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Xác nhận mật khẩu mới"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
      />
      {note ? (
        <p className={`cmc-account-note cmc-account-note--${note.type}`} role="status">
          {note.text}
        </p>
      ) : null}
      <div className="cmc-account-form-actions">
        <button type="submit" className="cmc-account-trigger" disabled={busy}>
          {busy ? "Đang lưu..." : "Lưu mật khẩu"}
        </button>
        <button
          type="button"
          className="cmc-account-cancel"
          onClick={() => {
            setOpen(false);
            reset();
            setNote(null);
          }}
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

export type PortalLink = { to: string; label: string; icon?: React.ReactNode; section?: string; badge?: number };

export function OperationsLayout({
  title,
  subtitle,
  links,
  bottomNav,
}: {
  title: string;
  subtitle: string;
  links: PortalLink[];
  bottomNav?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The sidebar is a fixed off-canvas drawer on small screens; close it whenever
  // the route changes so navigating from inside the drawer dismisses it.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // While the mobile drawer is open, let Escape close it and lock body scroll
  // behind the overlay. Desktop never opens the drawer, so this stays inert there.
  useEffect(() => {
    if (!drawerOpen) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const mobileTitle = useMemo(() => {
    const pathname = location.pathname;
    if (pathname === "/" || pathname === "") {
      return links.find((link) => link.to === "/")?.label ?? title;
    }
    const match = links.find(
      (link) => pathname === link.to || (link.to !== "/" && pathname.startsWith(`${link.to}/`)),
    );
    return match?.label ?? title;
  }, [links, location.pathname, title]);

  return (
    <div className="cmc-operations-shell">
      <header className="cmc-mobile-topbar">
        <div className="cmc-brand cmc-brand--compact">
          <span className="cmc-brand-mark">CMC</span>
          <strong>{mobileTitle}</strong>
        </div>
        <button
          type="button"
          className="cmc-nav-toggle"
          aria-label={drawerOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
          aria-expanded={drawerOpen}
          aria-controls="cmc-ops-sidebar"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      <button
        type="button"
        className={`cmc-drawer-overlay${drawerOpen ? " is-open" : ""}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setDrawerOpen(false)}
      />

      <aside id="cmc-ops-sidebar" className={`cmc-sidebar${drawerOpen ? " is-open" : ""}`}>
        <div className="cmc-brand">
          <span className="cmc-brand-mark">CMC</span>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
        </div>
        <nav aria-label={`${title} navigation`} className="cmc-sidebar-nav">
          {links.map((link, index) => {
            const showSection = link.section && link.section !== links[index - 1]?.section;
            return (
              <div key={link.to} className="cmc-nav-item">
                {showSection ? <p className="cmc-nav-section">{link.section}</p> : null}
                <NavLink
                  to={link.to}
                  end={link.to === "/" || link.to.split("/").length === 2}
                  className={({ isActive }) => (isActive ? "cmc-nav-link is-active" : "cmc-nav-link")}
                  onClick={() => setDrawerOpen(false)}
                >
                  {link.icon ? <span className="cmc-nav-icon">{link.icon}</span> : null}
                  <span className="cmc-nav-link-label">{link.label}</span>
                  {link.badge && link.badge > 0 ? (
                    <span className="cmc-nav-badge">{link.badge > 99 ? "99+" : link.badge}</span>
                  ) : null}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="cmc-user">
          <div className="cmc-user-identity">
            <span className="cmc-user-avatar" aria-hidden="true">
              {(user?.fullName ?? "?").trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <span>{user?.fullName}</span>
              <small>{user?.role}</small>
            </div>
          </div>
          <ChangePasswordControl />
          <button
            className="cmc-logout-btn"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            <LogOut aria-hidden="true" size={16} />
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className={`cmc-portal-content${bottomNav ? " cmc-portal-content--with-bottom-nav" : ""}`}>
        <Outlet />
      </main>
      {bottomNav}
    </div>
  );
}

export function LoginPage({
  portalName,
  allowedRoles,
  roleRedirects = {},
}: {
  portalName: string;
  allowedRoles: UserRole[];
  roleRedirects?: Partial<Record<UserRole, string>>;
}) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const target = (location.state as { from?: string } | null)?.from ?? "/";

  function resolveTarget(role: UserRole) {
    const roleTarget = roleRedirects[role];
    if (!roleTarget) {
      return target;
    }

    const targetIsAnotherPortal = Object.values(roleRedirects).some((redirect) =>
      typeof redirect === "string"
      && redirect !== "/"
      && (target === redirect || target.startsWith(`${redirect}/`)),
    );

    return target === "/" || targetIsAnotherPortal ? roleTarget : target;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Ô này nhân viên gõ email, nhưng trường gửi lên tên là `identifier` — backend dùng chung
      // một ô cho cả khách (số điện thoại) lẫn nhân viên (email).
      const user = await login({ identifier: email, password });
      if (!allowedRoles.includes(user.role)) {
        setError(`Tài khoản ${user.role} không được truy cập ${portalName}.`);
        return;
      }
      navigate(resolveTarget(user.role), { replace: true });
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "INVALID_CREDENTIALS") {
        setError(
          "Email hoặc mật khẩu không đúng. Sau nhiều lần thử sai, tài khoản sẽ tạm khoá 15 phút. Vui lòng thử lại sau.",
        );
      } else {
        setError(reason instanceof Error ? reason.message : "Đăng nhập thất bại.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="cmc-login-shell">
      <div className="cmc-login-split-card">
        {/* Left Side: Image & Welcome Text */}
        <div className="cmc-login-hero-side">
          <div className="cmc-login-hero-img-overlay" />
          <img
            className="cmc-login-hero-img"
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80"
            alt="CMC Restaurant Operations"
          />
          <div className="cmc-login-hero-content">
            <span className="cmc-login-hero-badge">CMC Operations</span>
            <h2>Xin Chào!</h2>
            <p>Đăng nhập để tiếp tục trải nghiệm quản lý và vận hành hệ thống CMC Restaurant.</p>
          </div>
        </div>

        {/* Right Side: Form */}
        <section className="cmc-login-form-side">
          <div className="cmc-login-form-container">
            <div className="cmc-login-form-header">
              <h1>Đăng Nhập</h1>
              <p>Nhập thông tin để truy cập hệ thống</p>
            </div>

            <form onSubmit={submit}>
              <div className="cmc-login-input-group">
                <label htmlFor="cmc-login-email">TÊN ĐĂNG NHẬP</label>
                <div className="cmc-login-input-wrapper">
                  <span className="cmc-login-input-icon">
                    <Mail size={16} />
                  </span>
                  <input
                    id="cmc-login-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="username"
                    placeholder="Nhập tên đăng nhập (email)"
                  />
                </div>
              </div>

              <div className="cmc-login-input-group">
                <label htmlFor="cmc-login-password">MẬT KHẨU</label>
                <div className="cmc-login-input-wrapper">
                  <span className="cmc-login-input-icon">
                    <Lock size={16} />
                  </span>
                  <input
                    id="cmc-login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                  />
                  <button
                    type="button"
                    className="cmc-login-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="cmc-login-extra">
                <label className="cmc-login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Ghi nhớ tôi</span>
                </label>
              </div>

              {error ? (
                <p className="cmc-form-error" role="alert">
                  {error}
                </p>
              ) : null}

              <button className="cmc-login-submit-btn" disabled={busy} type="submit">
                <LogIn size={16} />
                <span>{busy ? "Đang đăng nhập..." : "Đăng Nhập"}</span>
              </button>
            </form>

            <div className="cmc-login-footer">
              <span>Tài khoản vận hành do quản trị viên cấp.</span>
              <Link to="/" className="cmc-login-back-link">
                <ArrowLeft size={14} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                Quay lại trang chủ
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// ===========================================================================
// Form controls
// ===========================================================================
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`cmc-field${error ? " cmc-field--invalid" : ""}`}>
      <label className="cmc-field-label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="cmc-field-req" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <p className="cmc-field-hint">{hint}</p> : null}
      {error ? (
        <p className="cmc-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  id,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
}) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`cmc-field${error ? " cmc-field--invalid" : ""}`}>
      {label ? (
        <label className="cmc-field-label" htmlFor={inputId}>
          {label}
          {required ? (
            <span className="cmc-field-req" aria-hidden="true">
              {" *"}
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        id={inputId}
        className="cmc-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
      {hint && !error ? (
        <p className="cmc-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="cmc-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Textarea({
  label,
  hint,
  error,
  id,
  required,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
}) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`cmc-field${error ? " cmc-field--invalid" : ""}`}>
      {label ? (
        <label className="cmc-field-label" htmlFor={fieldId}>
          {label}
          {required ? (
            <span className="cmc-field-req" aria-hidden="true">
              {" *"}
            </span>
          ) : null}
        </label>
      ) : null}
      <textarea
        id={fieldId}
        className="cmc-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
      {hint && !error ? (
        <p className="cmc-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="cmc-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function IconButton({
  label,
  children,
  variant = "ghost",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "ghost" | "solid" | "danger";
}) {
  return (
    <button
      type="button"
      className={`cmc-icon-button cmc-icon-button--${variant}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

// ===========================================================================
// Feedback / status
// ===========================================================================
export function Spinner({ size = 24, label = "Đang tải" }: { size?: number; label?: string }) {
  return (
    <span
      className="cmc-spinner"
      role="status"
      aria-live="polite"
      style={{ width: size, height: size }}
    >
      <span className="cmc-spinner-track" />
      <span className="cmc-visually-hidden">{label}</span>
    </span>
  );
}

export function Skeleton({
  width,
  height = 16,
  radius = "var(--radius-sm)",
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  className?: string;
}) {
  return (
    <span
      className={`cmc-skeleton anim-shimmer ${className}`.trim()}
      style={{ width: width ?? "100%", height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="cmc-empty-state">
      {icon ? (
        <div className="cmc-empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
      {action ? <div className="cmc-empty-state-action">{action}</div> : null}
    </div>
  );
}

export type TimelineItem = {
  label: string;
  sublabel?: string;
  timestamp?: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  note?: string;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="cmc-timeline">
      {items.map((item, index) => (
        <li
          key={index}
          className={`cmc-timeline-item cmc-timeline-item--${item.tone ?? "neutral"}`}
        >
          <span className="cmc-timeline-dot" aria-hidden="true" />
          <div className="cmc-timeline-content">
            <div className="cmc-timeline-row">
              <strong>{item.label}</strong>
              {item.timestamp ? <time className="cmc-timeline-time">{item.timestamp}</time> : null}
            </div>
            {item.sublabel ? <span className="cmc-timeline-sub">{item.sublabel}</span> : null}
            {item.note ? <p className="cmc-timeline-note">{item.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ===========================================================================
// Overlays
// ===========================================================================
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const headingId = labelledBy ?? "cmc-modal-title";

  return createPortal(
    <div
      className="cmc-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="cmc-modal anim-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? headingId : undefined}
        tabIndex={-1}
        ref={dialogRef}
      >
        {title ? (
          <header className="cmc-modal-header">
            <h2 id={headingId}>{title}</h2>
            <IconButton label="Đóng" onClick={onClose}>
              ×
            </IconButton>
          </header>
        ) : null}
        <div className="cmc-modal-body">{children}</div>
        {footer ? <footer className="cmc-modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

// ===========================================================================
// Toasts
// ===========================================================================
type ToastTone = "info" | "success" | "warning" | "danger";
type ToastItem = { id: number; tone: ToastTone; message: string };
type ToastContextValue = { toast: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = (idRef.current += 1);
      setItems((current) => [...current, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return context;
}

export function Toaster({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cmc-toaster" role="region" aria-label="Thông báo" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`cmc-toast cmc-toast--${item.tone} anim-toast-in`} role="status">
          <span>{item.message}</span>
          <button
            type="button"
            className="cmc-toast-close"
            aria-label="Đóng thông báo"
            onClick={() => onDismiss(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ===========================================================================
// Routing
// ===========================================================================
export function PageTransition({
  children,
  transitionKey,
}: {
  children: ReactNode;
  transitionKey?: string;
}) {
  return (
    <div key={transitionKey} className="cmc-page-transition anim-fade-in-up">
      {children}
    </div>
  );
}
