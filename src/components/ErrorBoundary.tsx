import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Unexpected application error",
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ATOMS ErrorBoundary caught:", error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-200">
          <div className="w-full max-w-lg rounded-sm border border-red-900 bg-zinc-900 p-5">
            <h1 className="text-sm font-semibold text-red-300">ATOMS Runtime Error</h1>
            <p className="mt-2 break-words font-mono text-xs text-zinc-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="mt-4 rounded-sm bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
            >
              Recover Session
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
