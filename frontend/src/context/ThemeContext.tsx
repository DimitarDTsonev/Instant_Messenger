/**
 * Theme context — persists and broadcasts the user's light/dark preference.
 *
 * Key responsibilities:
 *  1. Reads the stored theme from `localStorage` on first render (defaults to "dark").
 *  2. Applies the theme by setting `data-theme` on `<html>` so global CSS variables
 *     switch without a flash of unstyled content.
 *  3. Persists the chosen theme to `localStorage` on every toggle.
 *
 * Consumed by: any component that renders theme-sensitive UI or shows a toggle button.
 * Provided by: App.tsx (wraps the entire tree).
 */

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

/** The two supported visual themes. */
type Theme = "dark" | "light";

/** Shape of the value provided by ThemeContext. */
type ThemeContextValue = {
  /** Current active theme. */
  theme: Theme;
  /** Toggles between `"dark"` and `"light"` and persists the selection. */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Provides the current theme and a toggle function to the component tree.
 *
 * Initialises from `localStorage.getItem("im_theme")`, falling back to `"dark"`.
 * Applies the theme by writing `data-theme` to `document.documentElement` so CSS
 * custom properties defined on `:root[data-theme="..."]` take effect.
 *
 * @param children - React subtree to wrap.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy init: read localStorage once on mount; avoids the default → stored flicker
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("im_theme") as Theme) || "dark"
  );

  // Sync the DOM attribute and localStorage whenever the theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("im_theme", theme);
  }, [theme]);

  /** Flips the theme between `"dark"` and `"light"`. */
  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Consumes the ThemeContext.
 * Must be called from a component inside `<ThemeProvider>`.
 *
 * @returns `{ theme, toggleTheme }`.
 * @throws  Error if called outside of a ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
