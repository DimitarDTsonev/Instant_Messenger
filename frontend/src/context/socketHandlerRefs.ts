import { useRef, useCallback } from "react";
import type { ChannelMessage, DirectMessage, Message, MessagePatch } from "../types";
import type {
  Handler, Unsubscribe, TypingPayload, DmTypingPayload,
  DeletedMessagePayload, DeletedDmPayload, ReactedMessagePayload,
  ChannelNotificationPayload, MentionPayload, DmReadPayload,
} from "./socketTypes";

export function useSocketHandlerRefs() {
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

  const onNewMessage      = useCallback((h: Handler<ChannelMessage>)            : Unsubscribe => { messageHandlerRef.current  = h; return () => { messageHandlerRef.current  = null; }; }, []);
  const onTypingUpdate    = useCallback((h: Handler<TypingPayload>)              : Unsubscribe => { typingHandlerRef.current   = h; return () => { typingHandlerRef.current   = null; }; }, []);
  const onNewDm           = useCallback((h: Handler<DirectMessage>)              : Unsubscribe => { dmHandlerRef.current       = h; return () => { dmHandlerRef.current       = null; }; }, []);
  const onMessageEdited   = useCallback((h: Handler<MessagePatch>)               : Unsubscribe => { editHandlerRef.current     = h; return () => { editHandlerRef.current     = null; }; }, []);
  const onMessageDeleted  = useCallback((h: Handler<DeletedMessagePayload>)      : Unsubscribe => { deleteHandlerRef.current   = h; return () => { deleteHandlerRef.current   = null; }; }, []);
  const onMessageReacted  = useCallback((h: Handler<ReactedMessagePayload>)      : Unsubscribe => { reactHandlerRef.current    = h; return () => { reactHandlerRef.current    = null; }; }, []);
  const onChannelNotify   = useCallback((h: Handler<ChannelNotificationPayload>) : Unsubscribe => { notifyHandlerRef.current   = h; return () => { notifyHandlerRef.current   = null; }; }, []);
  const onMessagePinned   = useCallback((h: Handler<Message>)                    : Unsubscribe => { pinHandlerRef.current      = h; return () => { pinHandlerRef.current      = null; }; }, []);
  const onMessageUnpinned = useCallback((h: Handler<DeletedMessagePayload>)      : Unsubscribe => { unpinHandlerRef.current    = h; return () => { unpinHandlerRef.current    = null; }; }, []);
  const onUserMentioned   = useCallback((h: Handler<MentionPayload>)             : Unsubscribe => { mentionHandlerRef.current  = h; return () => { mentionHandlerRef.current  = null; }; }, []);
  const onDmEdited        = useCallback((h: Handler<MessagePatch>)               : Unsubscribe => { dmEditHandlerRef.current   = h; return () => { dmEditHandlerRef.current   = null; }; }, []);
  const onDmDeleted       = useCallback((h: Handler<DeletedDmPayload>)           : Unsubscribe => { dmDeleteHandlerRef.current = h; return () => { dmDeleteHandlerRef.current = null; }; }, []);
  const onDmReacted       = useCallback((h: Handler<ReactedMessagePayload>)      : Unsubscribe => { dmReactHandlerRef.current  = h; return () => { dmReactHandlerRef.current  = null; }; }, []);
  const onDmRead          = useCallback((h: Handler<DmReadPayload>)              : Unsubscribe => { dmReadHandlerRef.current   = h; return () => { dmReadHandlerRef.current   = null; }; }, []);
  const onDmTypingUpdate  = useCallback((h: Handler<DmTypingPayload>)            : Unsubscribe => { dmTypingHandlerRef.current = h; return () => { dmTypingHandlerRef.current = null; }; }, []);

  return {
    messageHandlerRef, typingHandlerRef, dmHandlerRef, editHandlerRef,
    deleteHandlerRef, reactHandlerRef, notifyHandlerRef, pinHandlerRef,
    unpinHandlerRef, mentionHandlerRef, dmEditHandlerRef, dmDeleteHandlerRef,
    dmReactHandlerRef, dmReadHandlerRef, dmTypingHandlerRef,
    onNewMessage, onTypingUpdate, onNewDm, onMessageEdited, onMessageDeleted,
    onMessageReacted, onChannelNotify, onMessagePinned, onMessageUnpinned,
    onUserMentioned, onDmEdited, onDmDeleted, onDmReacted, onDmRead, onDmTypingUpdate,
  };
}