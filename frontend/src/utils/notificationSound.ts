/**
 * Browser audio notification utility using the Web Audio API.
 *
 * Plays a short single-tone "ping" sound when a new message arrives in a
 * channel or a DM. The tone is synthesised entirely in the browser with no
 * audio file dependency.
 *
 * The function skips playback while the page is visible and focused, so
 * foreground chat activity does not create unnecessary audio.
 *
 * Used by: hooks/useChatSocket.ts (onChannelNotify, onNewDm handlers).
 */

/**
 * Plays a short 880 Hz sine-wave tone that fades out over 350 ms.
 *
 * Uses the Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`):
 *  - `AudioContext`         — the audio rendering graph.
 *  - `createOscillator()`   — generates the sine wave at 880 Hz (A5).
 *  - `createGain()`         — controls volume; ramps from 0.25 to near-zero.
 *  - `exponentialRampToValueAtTime` — creates a natural fade-out curve.
 *  - `ctx.close()`          — releases audio hardware after playback ends.
 *
 * Errors are silently swallowed because browsers may block `AudioContext`
 * creation until after a user gesture, and some environments lack Web Audio.
 */
export function playNotificationSound() {
  if (document.visibilityState === "visible" && typeof document.hasFocus === "function" && document.hasFocus()) {
    return;
  }

  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    // Wire oscillator → gain → output
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = 880; // A5 note

    // Start at moderate volume then ramp to near-silence over 350 ms
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);

    // Release AudioContext resources after the tone finishes
    osc.onended = () => ctx.close();
  } catch {
    // AudioContext blocked by browser autoplay policy or unsupported — ignore
  }
}
