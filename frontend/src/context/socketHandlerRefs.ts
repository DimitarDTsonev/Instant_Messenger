/**
 * Socket event subscription layer using the Ref-handler pattern.
 *
 * The problem this solves: `SocketContext` creates the socket.io connection once
 * in a `useEffect([token, userId])`. If event handlers were registered inside
 * that same effect, they would need to be in the dep array, causing the socket to
 * reconnect every time any handler changed (e.g. when the active channel changes).
 *
 * Solution: each event is mapped to a `useRef` that holds the *latest* handler.
 * The socket `on()` listeners (registered once on connect) always call
 * `handlerRef.current?.(payload)`. Consumer hooks replace `handlerRef.current` by
 * calling the matching `onXxx(newHandler)` subscription function, which returns
 * an `Unsubscribe` function that sets the ref back to `null` on cleanup.
 *
 * This means handlers can change freely without triggering socket reconnects.
 *
 * Consumed by: SocketContext.tsx (provides refs + subscriptions to the context).
 * Used by: hooks/useChatSocket.ts, hooks/useDm.ts (via the `onXxx` subscriptions).
 */

import { useRef, useCallback } from "react";
import type { ChannelMessage, DirectMessage, Message, MessagePatch } from "../types";
import type {
  Handler, Unsubscribe, TypingPayload, DmTypingPayload,
  DeletedMessagePayload, DeletedDmPayload, ReactedMessagePayload,
  ChannelNotificationPayload, MentionPayload, DmReadPayload,
} from "./socketTypes";

/**
 * Creates one `useRef` per socket event and wraps each in a stable `useCallback`
 * subscription factory that sets/clears the ref.
 *
 * @returns Object containing:
 *  - `*HandlerRef`  — the raw refs (consumed by SocketContext to wire socket.on listeners).
 *  - `onXxx`        — stable subscription functions (consumed by hooks to register handlers).
 */
export function useSocketHandlerRefs() {
  // ─── Handler refs ─────────────────────────────────────────────────────────
  // One ref per inbound socket event. The socket listener always calls
  // `ref.current?.(payload)` so switching handlers never re-registers listeners.

  const messageHandlerRef  = useRef<Handler<ChannelMessage> | null>(null);
  const typingHandlerRef   = useRef<Handler<TypingPayload> | null>(null);
  const dmHandlerRef       = useRef<Handler<DirectMessage> | null>(null);
  const editHandlerRef     = useRef<Handler<MessagePatch> | null>(null);
  const deleteHandlerRef   = useRef<Handler<DeletedMessagePayload> | null>(null);
  const reactHandlerRef    = useRef<Handler<ReactedMessagePayload> | null>(null);
  const notifyHandlerRef   = useRef<Handler<ChannelNotificationPayload> | null>(null);
  const pinHandlerRef      = useRef<Handler<Message> | null>(null);
  const unpinHandlerRef    = useRef<Handler<DeletedMessagePayload> | null>(null);
  const mentionHandlerRef  = useRef<Handler<MentionPayload> | null>(null);
  const dmEditHandlerRef   = useRef<Handler<MessagePatch> | null>(null);
  const dmDeleteHandlerRef = useRef<Handler<DeletedDmPayload> | null>(null);
  const dmReactHandlerRef  = useRef<Handler<ReactedMessagePayload> | null>(null);
  const dmReadHandlerRef   = useRef<Handler<DmReadPayload> | null>(null);
  const dmTypingHandlerRef = useRef<Handler<DmTypingPayload> | null>(null);

  // ─── Subscription factories ────────────────────────────────────────────────
  // Each `onXxx` function assigns `h` to the ref and returns an unsubscribe
  // function that clears it. All are stable (`[]` dep) because refs never change.

  /** Registers `h` as the handler for `message:new`. Returns unsubscribe fn. */
  const onNewMessage      = useCallback((h: Handler<ChannelMessage>)            : Unsubscribe => { messageHandlerRef.current  = h; return () => { messageHandlerRef.current  = null; }; }, []);
  /** Registers `h` as the handler for `typing:update`. Returns unsubscribe fn. */
  const onTypingUpdate    = useCallback((h: Handler<TypingPayload>)              : Unsubscribe => { typingHandlerRef.current   = h; return () => { typingHandlerRef.current   = null; }; }, []);
  /** Registers `h` as the handler for `dm:new`. Returns unsubscribe fn. */
  const onNewDm           = useCallback((h: Handler<DirectMessage>)              : Unsubscribe => { dmHandlerRef.current       = h; return () => { dmHandlerRef.current       = null; }; }, []);
  /** Registers `h` as the handler for `message:edited`. Returns unsubscribe fn. */
  const onMessageEdited   = useCallback((h: Handler<MessagePatch>)               : Unsubscribe => { editHandlerRef.current     = h; return () => { editHandlerRef.current     = null; }; }, []);
  /** Registers `h` as the handler for `message:deleted`. Returns unsubscribe fn. */
  const onMessageDeleted  = useCallback((h: Handler<DeletedMessagePayload>)      : Unsubscribe => { deleteHandlerRef.current   = h; return () => { deleteHandlerRef.current   = null; }; }, []);
  /** Registers `h` as the handler for `message:reacted`. Returns unsubscribe fn. */
  const onMessageReacted  = useCallback((h: Handler<ReactedMessagePayload>)      : Unsubscribe => { reactHandlerRef.current    = h; return () => { reactHandlerRef.current    = null; }; }, []);
  /** Registers `h` as the handler for `channel:notification`. Returns unsubscribe fn. */
  const onChannelNotify   = useCallback((h: Handler<ChannelNotificationPayload>) : Unsubscribe => { notifyHandlerRef.current   = h; return () => { notifyHandlerRef.current   = null; }; }, []);
  /** Registers `h` as the handler for `message:pinned`. Returns unsubscribe fn. */
  const onMessagePinned   = useCallback((h: Handler<Message>)                    : Unsubscribe => { pinHandlerRef.current      = h; return () => { pinHandlerRef.current      = null; }; }, []);
  /** Registers `h` as the handler for `message:unpinned`. Returns unsubscribe fn. */
  const onMessageUnpinned = useCallback((h: Handler<DeletedMessagePayload>)      : Unsubscribe => { unpinHandlerRef.current    = h; return () => { unpinHandlerRef.current    = null; }; }, []);
  /** Registers `h` as the handler for `user:mentioned`. Returns unsubscribe fn. */
  const onUserMentioned   = useCallback((h: Handler<MentionPayload>)             : Unsubscribe => { mentionHandlerRef.current  = h; return () => { mentionHandlerRef.current  = null; }; }, []);
  /** Registers `h` as the handler for `dm:edited`. Returns unsubscribe fn. */
  const onDmEdited        = useCallback((h: Handler<MessagePatch>)               : Unsubscribe => { dmEditHandlerRef.current   = h; return () => { dmEditHandlerRef.current   = null; }; }, []);
  /** Registers `h` as the handler for `dm:deleted`. Returns unsubscribe fn. */
  const onDmDeleted       = useCallback((h: Handler<DeletedDmPayload>)           : Unsubscribe => { dmDeleteHandlerRef.current = h; return () => { dmDeleteHandlerRef.current = null; }; }, []);
  /** Registers `h` as the handler for `dm:reacted`. Returns unsubscribe fn. */
  const onDmReacted       = useCallback((h: Handler<ReactedMessagePayload>)      : Unsubscribe => { dmReactHandlerRef.current  = h; return () => { dmReactHandlerRef.current  = null; }; }, []);
  /** Registers `h` as the handler for `dm:read`. Returns unsubscribe fn. */
  const onDmRead          = useCallback((h: Handler<DmReadPayload>)              : Unsubscribe => { dmReadHandlerRef.current   = h; return () => { dmReadHandlerRef.current   = null; }; }, []);
  /** Registers `h` as the handler for `dm:typing:update`. Returns unsubscribe fn. */
  const onDmTypingUpdate  = useCallback((h: Handler<DmTypingPayload>)            : Unsubscribe => { dmTypingHandlerRef.current = h; return () => { dmTypingHandlerRef.current = null; }; }, []);

  return {
    // Refs (used by SocketContext to wire socket.on listeners)
    messageHandlerRef, typingHandlerRef, dmHandlerRef, editHandlerRef,
    deleteHandlerRef, reactHandlerRef, notifyHandlerRef, pinHandlerRef,
    unpinHandlerRef, mentionHandlerRef, dmEditHandlerRef, dmDeleteHandlerRef,
    dmReactHandlerRef, dmReadHandlerRef, dmTypingHandlerRef,
    // Subscription functions (used by consumer hooks)
    onNewMessage, onTypingUpdate, onNewDm, onMessageEdited, onMessageDeleted,
    onMessageReacted, onChannelNotify, onMessagePinned, onMessageUnpinned,
    onUserMentioned, onDmEdited, onDmDeleted, onDmReacted, onDmRead, onDmTypingUpdate,
  };
}
