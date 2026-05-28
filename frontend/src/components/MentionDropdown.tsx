/**
 * @mention autocomplete dropdown — appears below the message input when the
 * user types `@` followed by characters.
 *
 * Renders a scrollable list of matching users with their avatar label, username,
 * and an admin shield icon if applicable. The item at `activeIdx` is highlighted
 * so keyboard navigation (arrow keys in MessageInput) has a visual cursor.
 *
 * `onMouseDown` (not `onClick`) is used to prevent the textarea from losing
 * focus before the selection is committed.
 *
 * Used by: MessageInput.tsx.
 */

import type { MouseEvent } from "react";
import type { User } from "../types";
import { avatarLabel } from "../utils/avatar";
import Icon from "./Icons";
import { s } from "./messageInputStyles";

type Props = {
  /** Filtered list of users that match the current @query. */
  users: User[];
  /** Index of the currently keyboard-highlighted item. */
  activeIdx: number;
  /** Called with the selected username when an item is clicked or chosen via keyboard. */
  onSelect: (username: string) => void;
};

/**
 * Renders the @mention suggestion list.
 * Returns `null` when `users` is empty so no DOM node is created.
 *
 * @param users     - Matching users to show.
 * @param activeIdx - Index of the keyboard-highlighted row (highlighted in blue).
 * @param onSelect  - Callback invoked with the chosen username string.
 */
export default function MentionDropdown({ users, activeIdx, onSelect }: Props) {
  if (users.length === 0) return null;
  return (
    <div style={s.mentionDropdown}>
      {users.map((u, i) => (
        <div
          key={u.id}
          style={s.mentionItem(i === activeIdx)}
          // onMouseDown prevents focus loss before the selection is committed
          onMouseDown={(e: MouseEvent<HTMLDivElement>) => { e.preventDefault(); onSelect(u.username); }}
        >
          {/* Avatar initials label */}
          <span style={{ fontSize: "12px", fontWeight: 700 }}>{avatarLabel(u)}</span>
          <span style={{ color: "#f2f3f5" }}>@{u.username}</span>
          {/* Admin badge — only shown for users with role "admin" */}
          {u.role === "admin" && (
            <span title="Admin" style={{ color: "#faa61a", display: "inline-flex", alignItems: "center" }}>
              <Icon name="shield" size={12} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
