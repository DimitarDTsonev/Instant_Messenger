import type { MouseEvent } from "react";
import type { User } from "../types";
import { avatarLabel } from "../utils/avatar";
import Icon from "./Icons";
import { s } from "./messageInputStyles";

type Props = { users: User[]; activeIdx: number; onSelect: (username: string) => void };

export default function MentionDropdown({ users, activeIdx, onSelect }: Props) {
  if (users.length === 0) return null;
  return (
    <div style={s.mentionDropdown}>
      {users.map((u, i) => (
        <div
          key={u.id}
          style={s.mentionItem(i === activeIdx)}
          onMouseDown={(e: MouseEvent<HTMLDivElement>) => { e.preventDefault(); onSelect(u.username); }}
        >
          <span style={{ fontSize: "12px", fontWeight: 700 }}>{avatarLabel(u)}</span>
          <span style={{ color: "#f2f3f5" }}>@{u.username}</span>
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
