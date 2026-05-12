type AvatarSource = {
  username?: string | null;
  avatar?: string | null;
  email?: string | null;
};

export function avatarLabel(source: AvatarSource | null | undefined) {
  const avatar = source?.avatar?.trim();
  if (avatar && /^[A-Z0-9]{1,3}$/i.test(avatar)) return avatar.toUpperCase();

  const base = source?.username || source?.email || "user";
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : base.slice(0, 2);

  return initials.toUpperCase();
}
