/**
 * Scrollable message list — renders the full message timeline for a channel or DM.
 *
 * Scroll behaviour:
 *  - On initial load (wasLoading=true → loading=false): jumps to the bottom instantly
 *    via `scrollTop = scrollHeight`.
 *  - On new incoming messages while already near the bottom (< 200 px from bottom):
 *    smooth-scrolls to `bottomRef` (`scrollIntoView({ behavior: "smooth" })`).
 *  - Does NOT auto-scroll if the user has scrolled up to read history.
 *
 * Message grouping: `groupMessages()` from `messageFormatting` groups consecutive
 * messages from the same author within a time window into a `MessageGroup`, also
 * inserting `DateDivider` items between day boundaries.
 *
 * "Seen" indicator: in DM mode, when `seenByPartner` is true, the row immediately
 * after the last outgoing message shows a "Seen" label.  The last outgoing ID is
 * found by reversing `messages` and checking `user_id / sender_id`.
 *
 * Load-more: a "Load older messages" button at the top triggers `onLoadMore` for
 * keyset pagination (fetches messages before the oldest currently loaded).
 *
 * Used by: ChatPage.tsx.
 *
 * @param messages      - Ordered list of messages to render (oldest first).
 * @param loading       - True while the initial message fetch is in progress.
 * @param hasMore       - Whether older messages exist to paginate into.
 * @param onLoadMore    - Triggers the previous-page fetch.
 * @param typingUsers   - Usernames currently typing; rendered as italic footer.
 * @param onReply       - Forwarded to MessageRow reply button.
 * @param onPin         - Forwarded to MessageRow pin/unpin button.
 * @param canPin        - Whether the current user can pin/unpin messages.
 * @param users         - Full user list; forwarded to MessageRow for @-mention resolution.
 * @param isDm          - True when rendering a DM conversation.
 * @param seenByPartner - True when the DM partner has read the last outgoing message.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import MessageRow from "./MessageRow";
import { groupMessages } from "../utils/messageFormatting";
import { s } from "./chatAreaStyles";
import type { Message, User } from "../types";

type Props = {
  messages:     Message[];
  loading:      boolean;
  hasMore:      boolean;
  onLoadMore:   () => void;
  typingUsers?: string[];
  onReply?:     (message: Message) => void;
  onPin?:       (messageId: number, isCurrentlyPinned: boolean) => void;
  canPin?:      boolean;
  users?:       User[];
  isDm?:        boolean;
  seenByPartner?: boolean;
};

export default function ChatArea({
  messages, loading, hasMore, onLoadMore,
  typingUsers = [], onReply, onPin, canPin = false,
  users = [], isDm = false, seenByPartner = false,
}: Props) {
  const { user }      = useAuth();
  const bottomRef     = useRef<HTMLDivElement | null>(null);
  const scrollRef     = useRef<HTMLDivElement | null>(null);
  const prevLoading   = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    const wasLoading = prevLoading.current;
    prevLoading.current = loading;

    if (!el) return;

    // Loading just finished → jump to bottom immediately (initial load or channel switch)
    if (wasLoading && !loading && messages.length > 0) {
      el.scrollTop = el.scrollHeight;
      return;
    }

    // New message while not loading → scroll only when already near bottom
    if (!loading) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const groups = groupMessages(messages);

  const lastOutgoingId = isDm && seenByPartner
    ? [...messages].reverse().find((m) => m.user_id === user?.id || m.sender_id === user?.id)?.id
    : null;

  if (loading) {
    return (
      <div style={{ ...s.area, ...s.empty }}>
        <span style={s.emptyIcon}>...</span>
        <span>Loading messages...</span>
      </div>
    );
  }

  return (
    <div style={s.area} ref={scrollRef}>
      {hasMore && (
        <button style={s.loadMore} onClick={onLoadMore}>↑ Load older messages</button>
      )}

      {messages.length === 0 && (
        <div style={s.empty}>
          <span style={s.emptyIcon}>No messages</span>
          <span>No messages yet. Be the first!</span>
        </div>
      )}

      {groups.map((item) => {
        if (item.type === "divider") {
          return (
            <div key={item.key} style={s.dateDivider}>
              <div style={s.dividerLine} />
              <span>{item.label}</span>
              <div style={s.dividerLine} />
            </div>
          );
        }
        return (
          <div key={item.key} style={s.msgGroup}>
            {item.messages.map((msg, idx) => (
              <div key={msg.id}>
                <MessageRow
                  msg={msg} isGroupFirst={idx === 0}
                  avatar={item.avatar} username={item.username} role={item.role}
                  onReply={onReply} onPin={onPin} canPin={canPin}
                  users={users} isDm={isDm}
                />
                {lastOutgoingId === msg.id && (
                  <div style={{ textAlign: "right", fontSize: "11px", color: "#5865f2", paddingRight: "16px", paddingBottom: "2px" }} data-testid="seen-indicator">
                    Seen
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {typingUsers.length > 0 && (
        <div style={{ fontSize: "12px", color: "#949ba4", padding: "4px 8px", fontStyle: "italic" }}>
          {typingUsers.join(", ")} {typingUsers.length === 1 ? "is typing..." : "are typing..."}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
