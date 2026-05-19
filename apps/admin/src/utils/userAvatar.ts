const AVATAR_COLORS = [
  "#1F77B4",
  "#FF7F0E",
  "#2CA02C",
  "#D62728",
  "#9467BD",
  "#8C564B",
  "#E377C2",
  "#17BECF",
  "#BCBD22",
  "#7F7F7F",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getUserAvatarColor(seed: string | undefined | null): string {
  const key = seed && seed.length > 0 ? seed : "?";
  return AVATAR_COLORS[hashString(key) % AVATAR_COLORS.length];
}

export function getUserAvatarSeed(record: {
  email?: string;
  name?: string;
  user_id?: string;
  id?: string | number;
}): string {
  return (
    record.email ||
    record.name ||
    record.user_id ||
    (record.id !== undefined ? String(record.id) : "?")
  );
}
