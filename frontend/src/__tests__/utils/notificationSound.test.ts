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

function setHidden() {
  Object.defineProperty(document, "visibilityState", {
    get: () => "hidden",
    configurable: true,
  });
}

function setFocused() {
  Object.defineProperty(document, "visibilityState", {
    get: () => "visible",
    configurable: true,
  });
  document.hasFocus = () => true;
}

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
  // Use 'function' keyword (not arrow) so vi.fn wrapper is recognized as a constructor
  const Ctor = vi.fn(function() { return ctx; });
  Object.defineProperty(window, "AudioContext", {
    value: Ctor,
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
    const Ctor = vi.fn(function() {});
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
      value: vi.fn(function() { throw new Error("NotAllowedError"); }),
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
      value: vi.fn(function() { return ctx; }),
      configurable: true,
      writable: true,
    });

    playNotificationSound();

    expect(osc.start).toHaveBeenCalled();
  });
});
