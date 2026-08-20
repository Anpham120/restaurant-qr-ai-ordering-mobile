import { Component, type ErrorInfo, type ReactNode } from "react";

type OpsErrorBoundaryProps = {
  children: ReactNode;
  scope?: string;
};

type OpsErrorBoundaryState = {
  error: Error | null;
};

export class OpsErrorBoundary extends Component<OpsErrorBoundaryProps, OpsErrorBoundaryState> {
  state: OpsErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): OpsErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Giữ lại phương thức này thay vì xoá hẳn: `getDerivedStateFromError` chỉ lo phần HIỆN màn
    // hình lỗi, nó không nhận `componentStack`. Không ghi gì ở đây thì một lần vỡ hiển thị không
    // để lại dấu vết nào — người trực ca chỉ thấy "Ứng dụng vận hành gặp lỗi hiển thị" và không ai
    // biết vỡ ở component nào.
    console.error(
      `Lỗi hiển thị trong khu vực "${this.props.scope ?? "ops"}":`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="ops-notice ops-notice--danger" role="alert">
          <strong>Ứng dụng vận hành gặp lỗi hiển thị.</strong>
          <p>Vui lòng tải lại trang. Nếu lỗi lặp lại sau khi khách gọi món, báo quản trị.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
