import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "@/utils/errorReporting";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render-time crashes anywhere below it so a single broken component
 * shows a recovery screen instead of an empty white page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ui] unhandled render error", {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
    });
    reportError(error, { componentStack: info.componentStack ?? undefined });
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleGoHome = (): void => {
    window.location.assign("/chat");
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="flex min-h-svh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center text-fg"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Something went wrong</h1>
        <p className="max-w-md text-sm text-fg-muted">
          The page stopped responding because of an unexpected error. Your conversations are saved.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Reload page
          </button>
          <button
            type="button"
            onClick={this.handleGoHome}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-muted"
          >
            Back to chat
          </button>
        </div>
      </div>
    );
  }
}
