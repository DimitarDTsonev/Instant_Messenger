type IconName =
  | "smile"
  | "paperclip"
  | "send"
  | "reply"
  | "pin"
  | "pinOff"
  | "edit"
  | "trash"
  | "x"
  | "search"
  | "users"
  | "settings"
  | "shield"
  | "logOut"
  | "chevronUp"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "plus"
  | "hash"
  | "lock"
  | "download"
  | "externalLink"
  | "message"
  | "user"
  | "menu";

type Props = {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, string[]> = {
  smile: [
    "M8 14s1.5 2 4 2 4-2 4-2",
    "M9 9h.01",
    "M15 9h.01",
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  ],
  paperclip: [
    "m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 1 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.8-2.8l8.1-8.1",
  ],
  send: [
    "M22 2 11 13",
    "m22 2-7 20-4-9-9-4 20-7Z",
  ],
  reply: [
    "M9 17 4 12l5-5",
    "M20 18v-2a4 4 0 0 0-4-4H4",
  ],
  pin: [
    "m12 17-5 5",
    "M9 14 4 9l5-5 3 3 4-4 5 5-4 4 3 3-5 5-6-6Z",
  ],
  pinOff: [
    "m2 2 20 20",
    "m12 17-5 5",
    "M9 14 4 9l5-5 3 3m4-4 5 5-3.5 3.5",
  ],
  edit: [
    "M12 20h9",
    "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  ],
  trash: [
    "M3 6h18",
    "M8 6V4h8v2",
    "m19 6-1 14H6L5 6",
    "M10 11v6",
    "M14 11v6",
  ],
  x: [
    "M18 6 6 18",
    "M6 6l12 12",
  ],
  search: [
    "M21 21l-4.3-4.3",
    "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z",
  ],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M22 21v-2a4 4 0 0 0-3-3.9",
    "M16 3.1a4 4 0 0 1 0 7.8",
  ],
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z",
  ],
  shield: [
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  ],
  logOut: [
    "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
    "M16 17l5-5-5-5",
    "M21 12H9",
  ],
  chevronUp: ["m18 15-6-6-6 6"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  plus: [
    "M12 5v14",
    "M5 12h14",
  ],
  hash: [
    "M4 9h16",
    "M4 15h16",
    "M10 3 8 21",
    "M16 3l-2 18",
  ],
  lock: [
    "M7 11V7a5 5 0 0 1 10 0v4",
    "M5 11h14v10H5V11Z",
  ],
  download: [
    "M12 3v12",
    "m7 10 5 5 5-5",
    "M5 21h14",
  ],
  externalLink: [
    "M15 3h6v6",
    "M10 14 21 3",
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  ],
  message: [
    "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z",
  ],
  user: [
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  ],
  menu: [
    "M4 6h16",
    "M4 12h16",
    "M4 18h16",
  ],
};

export default function Icon({ name, size = 18 }: Props) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {paths[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
