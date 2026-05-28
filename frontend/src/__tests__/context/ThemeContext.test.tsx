import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../../context/ThemeContext";

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" data-testid="theme" onClick={toggleTheme}>
      {theme}
    </button>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeContext", () => {
  test("defaults to dark and persists it", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("im_theme")).toBe("dark");
  });

  test("initializes from localStorage", () => {
    localStorage.setItem("im_theme", "light");

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  test("toggles between dark and light", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("theme"));
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("im_theme")).toBe("light");

    fireEvent.click(screen.getByTestId("theme"));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("im_theme")).toBe("dark");
  });
});
