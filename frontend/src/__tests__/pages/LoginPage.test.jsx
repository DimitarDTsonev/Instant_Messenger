/**
 * @fileoverview Tests for LoginPage component
 * Covers: tab switching, form inputs, login call, register call, error display, loading state, demo hint
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "../../pages/LoginPage";

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    login:    vi.fn().mockResolvedValue({}),
    register: vi.fn().mockResolvedValue({}),
  })),
}));

import { useAuth } from "../../context/AuthContext";

describe("LoginPage", () => {
  test("renders Login and Register tabs", () => {
    render(<LoginPage />);
    expect(screen.getByText("Login")).toBeInTheDocument();
    expect(screen.getByText("Register")).toBeInTheDocument();
  });

  test("shows email and password fields by default (login mode)", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  test("shows username field only after switching to register tab", () => {
    render(<LoginPage />);
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Register"));
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  test("shows demo credentials hint in login mode", () => {
    render(<LoginPage />);
    expect(screen.getByText(/alice@demo.com/)).toBeInTheDocument();
  });

  test("hides demo hint in register mode", () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText("Register"));
    expect(screen.queryByText(/alice@demo.com/)).not.toBeInTheDocument();
  });

  test("pre-fills demo email and password", () => {
    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput.value).toBe("alice@demo.com");
    const passInput = screen.getByLabelText(/password/i);
    expect(passInput.value).toBe("password123");
  });

  test("calls login() with entered credentials on submit", async () => {
    const mockLogin = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ login: mockLogin, register: vi.fn() });

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i);
    const passInput  = screen.getByLabelText(/password/i);

    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "bob@test.com");
    await userEvent.clear(passInput);
    await userEvent.type(passInput, "secret");

    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form"));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("bob@test.com", "secret"));
  });

  test("calls register() with all fields in register mode", async () => {
    const mockRegister = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ login: vi.fn(), register: mockRegister });

    render(<LoginPage />);
    fireEvent.click(screen.getByText("Register"));

    await userEvent.type(screen.getByLabelText(/username/i), "newuser");
    const emailInput = screen.getByLabelText(/email/i);
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "new@test.com");
    const passInput = screen.getByLabelText(/password/i);
    await userEvent.clear(passInput);
    await userEvent.type(passInput, "newpass");

    fireEvent.submit(screen.getByRole("button", { name: /create account/i }).closest("form"));
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith("newuser", "new@test.com", "newpass")
    );
  });

  test("displays error message when login fails", async () => {
    useAuth.mockReturnValue({
      login:    vi.fn().mockRejectedValue(new Error("Invalid credentials")),
      register: vi.fn(),
    });

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form"));
    await waitFor(() => expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument());
  });

  test("displays error message when registration fails", async () => {
    useAuth.mockReturnValue({
      login:    vi.fn(),
      register: vi.fn().mockRejectedValue(new Error("Username taken")),
    });

    render(<LoginPage />);
    fireEvent.click(screen.getByText("Register"));
    fireEvent.submit(screen.getByRole("button", { name: /create account/i }).closest("form"));
    await waitFor(() => expect(screen.getByText(/Username taken/i)).toBeInTheDocument());
  });

  test("shows loading state while request is in flight", async () => {
    useAuth.mockReturnValue({
      login:    vi.fn(() => new Promise(() => {})),
      register: vi.fn(),
    });

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form"));
    await waitFor(() => expect(screen.getByText(/Loading/i)).toBeInTheDocument());
  });

  test("submit button is disabled while loading", async () => {
    useAuth.mockReturnValue({
      login:    vi.fn(() => new Promise(() => {})),
      register: vi.fn(),
    });

    render(<LoginPage />);
    const btn = screen.getByRole("button", { name: /sign in/i });
    fireEvent.submit(btn.closest("form"));
    await waitFor(() => expect(btn).toBeDisabled());
  });

  test("clears error message when user starts typing", async () => {
    useAuth.mockReturnValue({
      login:    vi.fn().mockRejectedValue(new Error("Bad credentials")),
      register: vi.fn(),
    });

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form"));
    await waitFor(() => screen.getByText(/Bad credentials/i));

    await userEvent.type(screen.getByLabelText(/email/i), "x");
    expect(screen.queryByText(/Bad credentials/i)).not.toBeInTheDocument();
  });
});
