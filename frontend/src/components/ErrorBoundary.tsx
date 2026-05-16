import { Component, type ReactNode } from "react";
import { Button, Result } from "antd";
import { createLogger } from "../logger";

const log = createLogger("error-boundary");

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    log.error("React render error:", error.message, error.stack);
    return { hasError: true, error };
  }

  handleReset = () => {
    if (this.state.retryCount >= MAX_RETRIES) return;
    this.setState((prev) => ({ hasError: false, error: null, retryCount: prev.retryCount + 1 }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const exceeded = this.state.retryCount >= MAX_RETRIES;
      return (
        <Result
          status="error"
          title="页面出现异常"
          subTitle={this.state.error?.message || "未知错误，请刷新页面重试"}
          extra={
            exceeded ? (
              <Button type="primary" onClick={this.handleReload}>
                刷新页面
              </Button>
            ) : (
              <Button type="primary" onClick={this.handleReset}>
                重试
              </Button>
            )
          }
        />
      );
    }
    return this.props.children;
  }
}
