/**
 * @fileoverview Tests for ForgotPasswordPage component.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ForgotPasswordPage from "../../pages/ForgotPasswordPage";

function mockFetch(ok = true, body = { success: true }) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) })
  );
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
