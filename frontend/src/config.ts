/**
 * Runtime configuration derived from Vite environment variables.
 *
 * Set these in a `.env` file (development) or in the hosting platform's
 * environment variable settings (production / Render / GitHub Pages).
 *
 * Variables:
 *  - VITE_API_URL    — Full URL to the backend REST API base path.
 *                      Default: "http://localhost:4000/api"
 *  - VITE_SOCKET_URL — Root URL of the Socket.io server (no path).
 *                      Default: "http://localhost:4000"
 *
 * Used by: all files that make API calls or connect to the WebSocket.
 */
export const API_BASE   = import.meta.env.VITE_API_URL    ?? "http://localhost:4000/api";
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";
