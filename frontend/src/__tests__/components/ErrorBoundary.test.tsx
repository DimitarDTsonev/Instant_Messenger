import { render, screen } from "@testing-library/react";
import ErrorBoundary from "../../components/ErrorBoundary";

// Component that throws on demand
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test render error");
  return <div>Safe content</div>;
}

// Suppress expected React error boundary console output
function suppressErrors() {
  const orig = console.error;
  beforeEach(() => { console.error = () => {}; });
  afterEach(() => { console.error = orig; });
}

describe("ErrorBoundary — happy path", () => {
  test("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
  });
});

describe("ErrorBoundary — error state", () => {
  suppressErrors();

  test("shows default fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test render error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
  });

  test("shows custom fallback when fallback prop is provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Custom error UI")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  test("does not render children when in error state", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText("Safe content")).not.toBeInTheDocument();
  });

  test("componentDidCatch is called and logs to console.error", () => {
    const errorSpy = vi.fn();
    console.error = errorSpy;

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "[ErrorBoundary]",
      expect.any(Error),
      expect.anything()
    );
  });
});
