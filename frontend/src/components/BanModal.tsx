/**
 * Ban confirmation modal — prompts the admin to confirm banning a user and
 * optionally enter a ban reason.
 *
 * Design:
 *  - Clicking the overlay backdrop calls `onCancel`.
 *  - `data-testid` attributes are present for automated testing.
 *
 * Used by: AdminPage.tsx (shown when the admin clicks a "Ban" button in the table).
 */

import type { ChangeEvent, MouseEvent } from "react";
import type { User } from "../types";
import { s } from "../pages/adminStyles";

type Props = {
  user:       User;
  banReason:  string;
  onReason:   (v: string) => void;
  onConfirm:  () => void;
  onCancel:   () => void;
  error:      string | null;
};

export default function BanModal({ user, banReason, onReason, onConfirm, onCancel, error }: Props) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onCancel}
      data-testid="ban-modal-overlay"
    >
      <div
        style={{ background: "#1e1e2e", borderRadius: "12px", padding: "24px", minWidth: "340px", maxWidth: "90vw", border: "1px solid #2d2d3f" }}
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        data-testid="ban-modal"
      >
        <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>Ban {user.username}?</div>
        <div style={{ fontSize: "13px", color: "#949ba4", marginBottom: "16px" }}>This user will be immediately disconnected and unable to log in.</div>
        <input
          style={{ ...s.filterInput, width: "100%", maxWidth: "none", marginBottom: "12px", boxSizing: "border-box" }}
          placeholder="Ban reason (optional)"
          value={banReason}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onReason(e.target.value)}
          data-testid="ban-reason-input"
          autoFocus
        />
        {error && <div style={{ ...s.error, marginBottom: "8px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button style={s.backBtn} onClick={onCancel} data-testid="ban-cancel">Cancel</button>
          <button style={{ ...s.actionBtn(true), padding: "6px 16px", fontSize: "13px" }} onClick={onConfirm} data-testid="ban-confirm">Ban User</button>
        </div>
      </div>
    </div>
  );
}