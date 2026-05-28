/**
 * Avatar label utility — generates a short display string for user avatars.
 *
 * Used everywhere a user avatar needs to be displayed as initials:
 * the sidebar DM list, message rows, user search results, profile modals, etc.
 */

type AvatarSource = {
  username?: string | null;
  avatar?: string | null;
  email?: string | null;
};

/**
 * Derives a 1–3 character avatar label from a user's stored avatar string,
 * username, or email address.
 *
 * Resolution order:
 *  1. If `avatar` is a non-empty 1–3 character alphanumeric string, use it as-is
 *     (this is the format stored by the backend on registration).
 *  2. Otherwise compute initials from the `username` or `email`:
 *     - Multi-word names (split on space, dot, underscore, hyphen) → first letter of first two parts.
 *     - Single-word names → first two characters.
 *
 * @param source - Object with optional username, avatar, and email fields.
 * @returns      Upper-cased 1–2 character initials string.
 *
 * @example
 * avatarLabel({ username: "john_doe" }) // → "JD"
 * avatarLabel({ avatar: "AB" })         // → "AB"
 * avatarLabel({ email: "x@y.com" })    // → "X@"  (edge case — short username preferred)
 */
export function avatarLabel(source: AvatarSource | null | undefined) {
  const avatar = source?.avatar?.trim();
  // Use stored avatar if it looks like initials (1–3 alphanumeric characters)
  if (avatar && /^[A-Z0-9]{1,3}$/i.test(avatar)) return avatar.toUpperCase();

  const base   = source?.username || source?.email || "user";
  const parts  = base.split(/[\s._-]+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`   // first letter of first two parts
    : base.slice(0, 2);                  // first two characters of single-part name

  return initials.toUpperCase();
}
