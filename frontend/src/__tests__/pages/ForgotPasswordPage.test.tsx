import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import ForgotPasswordPage from "../../pages/ForgotPasswordPage";
import { createMockFetch } from "../../test-utils/mocks";

declare const global: typeof globalThis;

function mockFetch(ok = true, body: Record<string, unknown> = { success: true }) {
  global.fetch = createMockFetch(ok, body);
}

beforeEach(() => mockFetch());
afterEach(() => vi.restoreAllMocks());

test("renders email input and submit button", () => {
  render(<ForgotPasswordPage onBack={() => {}} />);
  expect(screen.getByTestId("fp-email")).toBeInTheDocument();
  expect(screen.getByTestId("fp-submit")).toBeInTheDocument();
});

test("shows validation error when submitted without email", async () => {
  render(<ForgotPasswordPage onBack={() => {}} />);
  fireEvent.change(screen.getByTestId("fp-email"), { target: { value: "" } });
  await act(async () => { fireEvent.click(screen.getByTestId("fp-submit")); });
  expect(screen.getByTestId("fp-error")).toBeInTheDocument();
});

test("shows success message after submission", async () => {
  render(<ForgotPasswordPage onBack={() => {}} />);
  fireEvent.change(screen.getByTestId("fp-email"), { target: { value: "alice@example.com" } });
  await act(async () => { fireEvent.click(screen.getByTestId("fp-submit")); });
  await waitFor(() => expect(screen.getByTestId("sent-message")).toBeInTheDocument());
});

test("calls onBack when back button is clicked", () => {
  const onBack = vi.fn();
  render(<ForgotPasswordPage onBack={onBack} />);
  fireEvent.click(screen.getByTestId("fp-back"));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test("calls onBack from success state", async () => {
  const onBack = vi.fn();
  render(<ForgotPasswordPage onBack={onBack} />);
  fireEvent.change(screen.getByTestId("fp-email"), { target: { value: "x@y.com" } });
  await act(async () => { fireEvent.click(screen.getByTestId("fp-submit")); });
  await waitFor(() => screen.getByTestId("back-to-login"));
  fireEvent.click(screen.getByTestId("back-to-login"));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test("shows server error on failed request", async () => {
  mockFetch(false, { error: "Server error" });
  render(<ForgotPasswordPage onBack={() => {}} />);
  fireEvent.change(screen.getByTestId("fp-email"), { target: { value: "x@y.com" } });
  await act(async () => { fireEvent.click(screen.getByTestId("fp-submit")); });
  await waitFor(() => expect(screen.getByTestId("fp-error")).toBeInTheDocument());
});

test("shows default error message when API returns no error field", async () => {
  mockFetch(false, {});
  render(<ForgotPasswordPage onBack={() => {}} />);
  fireEvent.change(screen.getByTestId("fp-email"), { target: { value: "x@y.com" } });
  await act(async () => { fireEvent.click(screen.getByTestId("fp-submit")); });
  await waitFor(() => expect(screen.getByTestId("fp-error")).toHaveTextContent(/Request failed/i));
});

test("shows loading state while submitting", async () => {
  global.fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
  render(<ForgotPasswordPage onBack={() => {}} />);
  fireEvent.change(screen.getByTestId("fp-email"), { target: { value: "x@y.com" } });
  fireEvent.click(screen.getByTestId("fp-submit"));
  // The button should show loading state immediately
  expect(screen.getByTestId("fp-submit")).toHaveTextContent(/Sending/i);
  vi.restoreAllMocks();
});
