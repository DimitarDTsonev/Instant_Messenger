export function getAppPath() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return window.location.pathname.slice(base.length) || "/";
}

export function navigateTo(path: string, mode: "push" | "replace" = "push") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (mode === "replace") {
    window.history.replaceState({}, "", normalizedPath);
  } else {
    window.history.pushState({}, "", normalizedPath);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateHome(mode: "push" | "replace" = "push") {
  navigateTo("/", mode);
}