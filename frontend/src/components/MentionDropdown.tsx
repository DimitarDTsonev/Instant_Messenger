import type { MouseEvent } from "react";
import type { User } from "../types";
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
          <span style={{ fontSize: "18px" }}>{u.avatar || "👤"}</span>
          <span style={{ color: "#f2f3f5" }}>@{u.username}</span>
          {u.role === "admin" && <span title="Administrator" style={{ fontSize: "12px" }}>👑</span>}
        </div>
      ))}
    </div>
  );
}