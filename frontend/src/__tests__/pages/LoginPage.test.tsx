import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "../../pages/LoginPage";

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    login:    vi.fn().mockResolvedValue({}),
    register: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("../../context/ThemeContext", () => ({
  useTheme: vi.fn(() => ({ theme: "dark", toggleTheme: vi.fn() })),
}));

vi.mock("../../pages/ForgotPasswordPage", () => ({
  default: ({ onBack }) => <div>Reset your password <button onClick={onBack}>Back</button></div>,
}));

import { useAuth } from "../../context/AuthContext";

function authMock(overrides: Record<string, unknown> = {}) {
  return {
    user: null,
    token: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    loginWithToken: vi.fn(),
    authFetch: vi.fn(),
    ...overrides,
  } as any;
}

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
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(emailInput.value).toBe("alice@demo.com");
    const passInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    expect(passInput.value).toBe("Password@123");
  });

  test("calls login() with entered credentials on submit", async () => {
    const mockLogin = vi.fn().mockResolvedValue({});
    vi.mocked(useAuth).mockReturnValue(authMock({ login: mockLogin }));

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
    vi.mocked(useAuth).mockReturnValue(authMock({ register: mockRegister }));

    render(<LoginPage />);
    fireEvent.click(screen.getByText("Register"));

    await userEvent.type(screen.getByLabelText(/username/i), "newuser");
    const emailInput = screen.getByLabelText(/email/i);
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "new@test.com");
    const passInput = screen.getByLabelText(/password/i);
    await userEvent.clear(passInput);
    await userEvent.type(passInput, "Newpass1!");

    fireEvent.submit(screen.getByRole("button", { name: /create account/i }).closest("form"));
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith("newuser", "new@test.com", "Newpass1!")
    );
  });

  test("displays error message when login fails", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({
      login: vi.fn().mockRejectedValue(new Error("Invalid credentials")),
    }));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form"));
    await waitFor(() => expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument());
  });

  test("displays error message when registration fails", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({
      register: vi.fn().mockRejectedValue(new Error("Username taken")),
    }));

    render(<LoginPage />);
    fireEvent.click(screen.getByText("Register"));
    const passInput = screen.getByLabelText(/password/i);
    await userEvent.clear(passInput);
    await userEvent.type(passInput, "Password1!");
    fireEvent.submit(screen.getByRole("button", { name: /create account/i }).closest("form"));
    await waitFor(() => expect(screen.getByText(/Username taken/i)).toBeInTheDocument());
  });

  test("shows loading state while request is in flight", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({
      login: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form"));
    await waitFor(() => expect(screen.getByText(/Loading/i)).toBeInTheDocument());
  });

  test("submit button is disabled while loading", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({
      login: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    render(<LoginPage />);
    const btn = screen.getByRole("button", { name: /sign in/i });
    fireEvent.submit(btn.closest("form"));
    await waitFor(() => expect(btn).toBeDisabled());
  });

  test("clears error message when user starts typing", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({
      login: vi.fn().mockRejectedValue(new Error("Bad credentials")),
    }));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form"));
    await waitFor(() => screen.getByText(/Bad credentials/i));

    await userEvent.type(screen.getByLabelText(/email/i), "x");
    expect(screen.queryByText(/Bad credentials/i)).not.toBeInTheDocument();
  });

  test("clicking forgot password link shows ForgotPasswordPage", () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByTestId("forgot-password-link"));
    expect(screen.getByText(/Reset your password/i)).toBeInTheDocument();
  });
});
