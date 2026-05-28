/**
 * Vitest global test setup — runs before every test file via `setupFiles` in
 * vitest.config.ts.
 *
 * Patches:
 *  1. `socket.io-client` — mocked globally so tests never open a real WebSocket.
 *     Individual tests can assert on `io` mock calls by importing from
 *     'socket.io-client' after the mock is applied.
 *  2. `window.matchMedia` — jsdom does not implement this browser API; the stub
 *     prevents "matchMedia is not a function" errors in components that read the
 *     user's preferred color scheme.
 */
import "@testing-library/jest-dom";

// Mock socket.io-client so no real WebSocket connection is attempted in tests.
// Individual tests can inspect mock calls via: import { io } from 'socket.io-client'
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    on:         vi.fn(),
    off:        vi.fn(),
    emit:       vi.fn(),
    disconnect: vi.fn(),
    connected:  true,
  })),
}));

// Stub window.matchMedia which is absent in jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});