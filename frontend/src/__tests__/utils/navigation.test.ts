/**
 * Navigation utility tests — verifies getAppPath, navigateHome, and navigateTo
 * helpers, including History API push vs replace modes and popstate dispatch.
 */
import { getAppPath, navigateHome, navigateTo } from "../../utils/navigation";

describe("navigation helpers", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  test("getAppPath returns the current app path", () => {
    window.history.pushState({}, "", "/reset-password?token=abc");
    expect(getAppPath()).toBe("/reset-password");
  });

  test("navigateTo pushes a normalized path and emits popstate", () => {
    const popStateHandler = vi.fn();
    window.addEventListener("popstate", popStateHandler);

    navigateTo("admin");

    expect(window.location.pathname).toBe("/admin");
    expect(popStateHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener("popstate", popStateHandler);
  });

  test("navigateHome can replace the current history entry", () => {
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    window.history.pushState({}, "", "/invite/ABC123");

    navigateHome("replace");

    expect(replaceSpy).toHaveBeenCalledWith({}, "", "/");
    expect(window.location.pathname).toBe("/");

    replaceSpy.mockRestore();
  });
});
