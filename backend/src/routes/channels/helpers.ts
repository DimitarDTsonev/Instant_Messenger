/**
 * Re-exports channel repository helpers for backwards compatibility.
 *
 * `DEFAULT_PERMS`, `getUserRole`, and `getPerms` were previously defined in this
 * file. They have since been moved to the repository layer. This module re-exports
 * them so any existing imports from this path continue to work unchanged.
 *
 * Used by: socket/handlers.ts (getUserRole), socket/messageHandlers.ts (getPerms).
 */
export { DEFAULT_PERMS, getUserRole, getPerms } from "../../repositories/channels.repository";