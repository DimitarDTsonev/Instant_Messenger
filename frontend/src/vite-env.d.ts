/// <reference types="vite/client" />

import type { CSSProperties } from "react";

declare global {
  type AppStyle = CSSProperties;
  type AppStyleMap = Record<string, CSSProperties | ((...args: unknown[]) => CSSProperties)>;
  type SocketAck<T = unknown> = {
    error?: string;
    message?: T;
    success?: boolean;
  };
  type ReactionMap = Record<string, number[]>;

  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export {};
