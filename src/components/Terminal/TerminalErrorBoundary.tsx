import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onBack(): void;
}

interface State {
  error: string | null;
}

export class TerminalErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Terminal crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-(--color-bg) p-6">
        <div className="max-w-xl rounded-xl border border-(--color-danger)/30 bg-(--color-danger)/10 p-4 text-sm">
          <div className="font-medium text-(--color-danger)">Терминал упал при открытии</div>
          <div className="mt-2 font-mono text-xs text-(--color-fg-mute) break-words">{this.state.error}</div>
          <button
            type="button"
            onClick={this.props.onBack}
            className="mt-4 h-8 px-3 rounded-md bg-(--color-bg-mute) text-xs text-(--color-fg) hover:bg-(--color-border)"
          >
            Вернуться в Chat
          </button>
        </div>
      </div>
    );
  }
}
