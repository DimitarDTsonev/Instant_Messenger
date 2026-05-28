/**
 * React class-based error boundary — catches unhandled render errors in the
 * component subtree and displays a fallback UI instead of a white screen.
 *
 * Used by: App.tsx (wraps the entire tree and the ChatPage/SocketProvider subtree).
 * Reference: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

type Props = {
  children: ReactNode;
  /** Optional custom fallback to render on error instead of the default overlay. */
  fallback?: ReactNode;
};
type State = { error: Error | null };

/**
 * Catches render-phase errors thrown anywhere in its children.
 *
 * When an error is caught:
 *  1. `getDerivedStateFromError` sets `state.error` so the error UI renders.
 *  2. `componentDidCatch` logs the error and component stack to the console.
 *  3. `render` shows `props.fallback` if provided, or the built-in overlay with
 *     the error message and a "Reload page" button.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  /**
   * React lifecycle — updates state with the caught error so the next render
   * shows the fallback UI.
   *
   * @param error - The error thrown during rendering.
   * @returns     New state with `error` set.
   */
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  /**
   * React lifecycle — called after the error UI has rendered.
   * Logs the error and component stack for debugging.
   *
   * @param error - The caught error.
   * @param info  - Contains `componentStack` — the React fiber stack trace.
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      // Render the caller-supplied fallback, or fall back to the default overlay
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
          {/* Clears the error state and hard-reloads so the app can recover */}
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
