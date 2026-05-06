/**
 * @fileoverview Tests for playNotificationSound utility
 * Covers: early-return when focused, AudioContext happy path,
 *         ctx.close on oscillator end, and silent catch on failure.
 *
 * jsdom quirk: document.hasFocus() returns true by default.
 * Tests that need the function to proceed past the guard use
 * visibilityState="hidden" (falsy short-circuit) instead of
 * mocking hasFocus to avoid flaky spy behaviour.
 *
 * vi.stubGlobal targets globalThis but source reads window.AudioContext;
 * in jsdom these can diverge, so we use Object.defineProperty(window, …)
 * directly (same pattern as the matchMedia stub in setup.js).
 */

import { playNotificationSound } from "../../utils/notificationSound";

afterEach(() => {
  // Restore document state
  Object.defineProperty(document, "visibilityState", {
    get: () => "visible",
    configurable: true,
  });
  delete document.hasFocus;
  // Remove AudioContext stubs
  delete window.AudioContext;
  delete window.webkitAudioContext;
});

/** Sets document into a "background tab" state so the early-return is skipped. */
function setHidden() {
  Object.defineProperty(document, "visibilityState", {
    get: () => "hidden",
    configurable: true,
  });
}

/** Sets document into "focused + visible" state so the early-return triggers. */
function setFocused() {
  Object.defineProperty(document, "visibilityState", {
    get: () => "visible",
    configurable: true,
  });
  document.hasFocus = () => true;
}

/** Builds a fake AudioContext + nodes and stubs window.AudioContext. Returns nodes. */
function stubAudioContext() {
  const osc = {
    connect: vi.fn(), type: "", frequency: { value: 0 },
    start: vi.fn(), stop: vi.fn(), onended: null,
  };
  const gain = {
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  };
  const ctx = {
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
    destination: {}, currentTime: 0, close: vi.fn(),
  };
  Object.defineProperty(window, "AudioContext", {
    value: vi.fn(() => ctx),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "webkitAudioContext", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  return { osc, gain, ctx };
}

describe("playNotificationSound", () => {
  test("returns early without creating AudioContext when page is focused and visible", () => {
    setFocused();
    const Ctor = vi.fn();
    Object.defineProperty(window, "AudioContext", {
      value: Ctor,
      configurable: true,
      writable: true,
    });

    playNotificationSound();

    expect(Ctor).not.toHaveBeenCalled();
  });

  test("creates and starts oscillator when page is hidden (background tab)", () => {
    setHidden();
    const { osc } = stubAudioContext();

    playNotificationSound();

    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  test("calls ctx.close() when the oscillator's onended fires", () => {
    setHidden();
    const { osc, ctx } = stubAudioContext();

    playNotificationSound();

    // The source assigns osc.onended = () => ctx.close(); simulate it:
    osc.onended();
    expect(ctx.close).toHaveBeenCalled();
  });

  test("does not throw when AudioContext is unavailable", () => {
    setHidden();
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(() => playNotificationSound()).not.toThrow();
  });

  test("does not throw when AudioContext constructor throws", () => {
    setHidden();
    Object.defineProperty(window, "AudioContext", {
      value: vi.fn(() => { throw new Error("NotAllowedError"); }),
      configurable: true,
      writable: true,
    });

    expect(() => playNotificationSound()).not.toThrow();
  });

  test("uses webkitAudioContext as fallback when AudioContext is absent", () => {
    setHidden();
    const osc = {
      connect: vi.fn(), type: "", frequency: { value: 0 },
      start: vi.fn(), stop: vi.fn(), onended: null,
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };
    const ctx = {
      createOscillator: () => osc, createGain: () => gain,
      destination: {}, currentTime: 0, close: vi.fn(),
    };
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: vi.fn(() => ctx),
      configurable: true,
      writable: true,
    });

    playNotificationSound();

    expect(osc.start).toHaveBeenCalled();
  });
});
