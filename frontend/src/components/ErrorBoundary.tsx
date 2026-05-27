import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{
          height: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0f0f0f", color: "#f2f3f5", gap: "16px", padding: "24px", textAlign: "center",
        }}>
          <div style={{ fontSize: "32px" }}>⚠</div>
          <div style={{ fontSize: "18px", fontWeight: 600 }}>Something went wrong</div>
          <div style={{ fontSize: "13px", color: "#5c6068", maxWidth: "400px" }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              background: "#5865f2", color: "#fff", border: "none", borderRadius: "6px",
              padding: "8px 20px", fontSize: "14px", cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
