import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import ResetPasswordPage from "../../pages/ResetPasswordPage";
import { navigateHome } from "../../utils/navigation";
import { createMockFetch } from "../../test-utils/mocks";

declare const global: typeof globalThis;

vi.mock("../../utils/navigation", () => ({
  navigateHome: vi.fn(),
}));

function mockSearch(token = "abc123") {
  window.history.pushState({}, "", `/reset-password${token ? `?token=${token}` : ""}`);
}

function mockFetch(ok = true, body: Record<string, unknown> = { success: true }) {
  global.fetch = createMockFetch(ok, body);
}

beforeEach(() => {
  mockSearch();
  mockFetch();
});

afterEach(() => vi.restoreAllMocks());

test("renders password inputs and submit button", () => {
  render(<ResetPasswordPage />);
  expect(screen.getByTestId("rp-password")).toBeInTheDocument();
  expect(screen.getByTestId("rp-confirm")).toBeInTheDocument();
  expect(screen.getByTestId("rp-submit")).toBeInTheDocument();
});

test("shows error when submitted with empty password", async () => {
  render(<ResetPasswordPage />);
  await act(async () => { fireEvent.click(screen.getByTestId("rp-submit")); });
  expect(screen.getByTestId("rp-error")).toBeInTheDocument();
});

test("shows error when password is too short", async () => {
  render(<ResetPasswordPage />);
  fireEvent.change(screen.getByTestId("rp-password"), { target: { value: "abc" } });
  fireEvent.change(screen.getByTestId("rp-confirm"), { target: { value: "abc" } });
  await act(async () => { fireEvent.click(screen.getByTestId("rp-submit")); });
  await waitFor(() => expect(screen.getByTestId("rp-error")).toHaveTextContent(/6 characters/i));
});

test("shows error when passwords do not match", async () => {
  render(<ResetPasswordPage />);
  fireEvent.change(screen.getByTestId("rp-password"), { target: { value: "Newpass1!" } });
  fireEvent.change(screen.getByTestId("rp-confirm"), { target: { value: "Newpass2!" } });
  await act(async () => { fireEvent.click(screen.getByTestId("rp-submit")); });
  await waitFor(() => expect(screen.getByTestId("rp-error")).toHaveTextContent(/do not match/i));
});

test("shows success message after successful reset", async () => {
  render(<ResetPasswordPage />);
  fireEvent.change(screen.getByTestId("rp-password"), { target: { value: "Newpass1!" } });
  fireEvent.change(screen.getByTestId("rp-confirm"), { target: { value: "Newpass1!" } });
  await act(async () => { fireEvent.click(screen.getByTestId("rp-submit")); });
  await waitFor(() => expect(screen.getByTestId("reset-success")).toBeInTheDocument());
});

test("shows API error on failed reset", async () => {
  mockFetch(false, { error: "Invalid or expired reset token" });
  render(<ResetPasswordPage />);
  fireEvent.change(screen.getByTestId("rp-password"), { target: { value: "Newpass1!" } });
  fireEvent.change(screen.getByTestId("rp-confirm"), { target: { value: "Newpass1!" } });
  await act(async () => { fireEvent.click(screen.getByTestId("rp-submit")); });
  await waitFor(() => expect(screen.getByTestId("rp-error")).toHaveTextContent(/expired/i));
});

test("shows invalid token warning when no token in URL", () => {
  mockSearch("");
  render(<ResetPasswordPage />);
  expect(screen.getByTestId("no-token-error")).toBeInTheDocument();
});

test("clicking go to login button redirects to login page", async () => {
  render(<ResetPasswordPage />);
  fireEvent.change(screen.getByTestId("rp-password"), { target: { value: "Newpass1!" } });
  fireEvent.change(screen.getByTestId("rp-confirm"), { target: { value: "Newpass1!" } });
  await act(async () => { fireEvent.click(screen.getByTestId("rp-submit")); });
  await waitFor(() => expect(screen.getByTestId("go-to-login")).toBeInTheDocument());
  fireEvent.click(screen.getByTestId("go-to-login"));

  expect(navigateHome).toHaveBeenCalled();
});
