export type Platform =
  | "youtube"
  | "instagram"
  | "x"
  | "facebook"
  | "tiktok"
  | "reddit"
  | "vimeo"
  | "soundcloud"
  | "pinterest"
  | "snapchat"
  | "twitch"
  | "tumblr"
  | "dailymotion"
  | "bluesky"
  | "vk"
  | "ok"
  | "streamable"
  | "loom"
  | "bilibili"
  | "rutube"
  | "newgrounds"
  | "web";

export type Quality = "max" | "1080" | "720" | "480";

export type FetchMode = "video" | "audio";

export type MediaKind = "video" | "audio" | "image";

export type SaveStyle = "blob" | "navigate";

export type MediaFile = {
  id: string;
  groupId: string;
  kind: MediaKind;
  label: string;
  detail: string;
  filename: string;
  url: string;
  bytes?: number;
  save: SaveStyle;
  expiresSoon: boolean;
  preview: boolean;
};

export type MediaResult = {
  platform: Platform;
  title: string;
  author: string;
  thumbnail?: string;
  durationSec?: number;
  hint?: string;
  pageUrl?: string;
  files: MediaFile[];
};

export type ResolveOk = { ok: true; media: MediaResult };

export type ResolveErr = { ok: false; error: string };

export type ResolveResponse = ResolveOk | ResolveErr;

export type ResolveInput = {
  url: string;
  mode: FetchMode;
  quality: Quality;
};

export const SAMPLE_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

const PLATFORM_HOSTS: Array<{ platform: Platform; hosts: string[] }> = [
  {
    platform: "youtube",
    hosts: ["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"],
  },
  { platform: "instagram", hosts: ["instagram.com", "m.instagram.com", "instagr.am"] },
  {
    platform: "x",
    hosts: [
      "x.com",
      "twitter.com",
      "mobile.twitter.com",
      "mobile.x.com",
      "fxtwitter.com",
      "vxtwitter.com",
      "fixupx.com",
    ],
  },
  {
    platform: "facebook",
    hosts: ["facebook.com", "m.facebook.com", "mbasic.facebook.com", "web.facebook.com", "l.facebook.com", "lm.facebook.com", "fb.watch", "fb.com"],
  },
  { platform: "tiktok", hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"] },
  { platform: "reddit", hosts: ["reddit.com", "old.reddit.com", "redd.it"] },
  { platform: "vimeo", hosts: ["vimeo.com", "player.vimeo.com"] },
  { platform: "soundcloud", hosts: ["soundcloud.com", "m.soundcloud.com"] },
  { platform: "pinterest", hosts: ["pinterest.com", "pin.it"] },
  { platform: "snapchat", hosts: ["snapchat.com"] },
  { platform: "twitch", hosts: ["twitch.tv", "clips.twitch.tv"] },
  { platform: "tumblr", hosts: ["tumblr.com"] },
  { platform: "dailymotion", hosts: ["dailymotion.com", "dai.ly"] },
  { platform: "bluesky", hosts: ["bsky.app"] },
  { platform: "vk", hosts: ["vk.com", "vk.ru", "vkvideo.ru"] },
  { platform: "ok", hosts: ["ok.ru"] },
  { platform: "streamable", hosts: ["streamable.com"] },
  { platform: "loom", hosts: ["loom.com"] },
  { platform: "bilibili", hosts: ["bilibili.com", "bilibili.tv", "b23.tv"] },
  { platform: "rutube", hosts: ["rutube.ru"] },
  { platform: "newgrounds", hosts: ["newgrounds.com"] },
];

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
  facebook: "Facebook",
  tiktok: "TikTok",
  reddit: "Reddit",
  vimeo: "Vimeo",
  soundcloud: "SoundCloud",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  twitch: "Twitch",
  tumblr: "Tumblr",
  dailymotion: "Dailymotion",
  bluesky: "Bluesky",
  vk: "VK",
  ok: "OK",
  streamable: "Streamable",
  loom: "Loom",
  bilibili: "Bilibili",
  rutube: "Rutube",
  newgrounds: "Newgrounds",
  web: "Public",
};

export function platformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform];
}

export function hostLabel(raw: string): string {
  const url = toUrl(extractUrl(raw));
  if (!url) return "Public";
  return url.hostname.replace(/^www\./, "");
}

export function extractUrl(raw: string): string {
  const trimmed = raw.trim();
  const found = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (found) return found[0].replace(/[),.;]+$/g, "");
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed)) {
    return `https://${trimmed.replace(/^https?:\/\//i, "")}`;
  }
  return trimmed;
}

export function unwrapLink(raw: string): string {
  const first = extractUrl(raw);
  const url = toUrl(first);
  if (!url) return first;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const bridge =
    host === "l.facebook.com" ||
    host === "lm.facebook.com" ||
    url.pathname === "/l.php" ||
    (host === "youtube.com" && url.pathname === "/redirect");
  if (!bridge) return first;
  const inner = url.searchParams.get("u") || url.searchParams.get("url") || url.searchParams.get("q");
  if (!inner || !/^https?:\/\//i.test(inner)) return first;
  const next = unwrapLink(inner);
  const parsed = toUrl(next);
  if (!parsed || !isPublicHost(parsed.hostname)) return first;
  return parsed.toString();
}

export function canonicalMediaUrl(raw: string): string {
  const unwrapped = unwrapLink(raw);
  const url = toUrl(unwrapped);
  if (!url) return unwrapped;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^[\w-]{6,}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const shorts = url.pathname.match(/\/shorts\/([\w-]{6,})/);
    const live = url.pathname.match(/\/live\/([\w-]{6,})/);
    const id = shorts?.[1] || live?.[1] || (url.pathname === "/watch" ? url.searchParams.get("v") : null);
    if (id && /^[\w-]{6,}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  }
  return unwrapped;
}

export function youtubeId(raw: string): string | null {
  const url = toUrl(canonicalMediaUrl(raw));
  if (!url) return null;
  const id = url.searchParams.get("v");
  return id && /^[\w-]{6,}$/.test(id) ? id : null;
}

export function youtubeThumb(raw: string): string | undefined {
  const id = youtubeId(raw);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

export function isWeakTitle(value: string, platform: Platform): boolean {
  const text = value.trim();
  if (!text) return true;
  const plain = text.toLowerCase();
  if (plain === platformLabel(platform).toLowerCase()) return true;
  if (plain === "facebook video" || plain === "video" || plain === "watch") return true;
  if (/^[a-z]+_[a-z0-9-]{4,}$/i.test(text.replace(/\s+/g, ""))) return true;
  return false;
}

export function detectPlatform(raw: string): Platform | null {
  const url = toUrl(unwrapLink(raw));
  if (!url || !isPublicHost(url.hostname)) return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  for (const entry of PLATFORM_HOSTS) {
    if (entry.hosts.some((item) => host === item || host.endsWith(`.${item}`))) {
      return entry.platform;
    }
  }
  return "web";
}

function isPublicHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (host.includes(":")) return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    return false;
  }
  return host.includes(".");
}

export function toUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function xStatusId(raw: string): string | null {
  const url = toUrl(extractUrl(raw));
  if (!url || detectPlatform(raw) !== "x") return null;
  const match = url.pathname.match(/\/status(?:es)?\/(\d+)/);
  return match?.[1] ?? null;
}

export function instagramCode(raw: string): { code: string; kind: "p" | "reel" } | null {
  const url = toUrl(extractUrl(raw));
  if (!url || detectPlatform(raw) !== "instagram") return null;
  const match = url.pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const kind = match[1] === "p" || match[1] === "tv" ? "p" : "reel";
  return { code: match[2], kind };
}

export function safeFilename(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{M}\p{N}.\- ()[\]]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return cleaned || fallback;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function kindFromFilename(name: string, hinted?: string): MediaKind {
  const lower = name.toLowerCase();
  if (hinted === "photo" || hinted === "image") return "image";
  if (/\.(mp3|m4a|aac|opus|ogg|wav|flac)$/.test(lower)) return "audio";
  if (/\.(jpe?g|png|webp|gif)$/.test(lower)) return "image";
  return "video";
}

export function resolutionFromName(name: string): string | null {
  const labeled = name.match(/\((\d{3,4})p\b/i);
  if (labeled) return `${labeled[1]}p`;
  const pair = name.match(/(\d{3,4})x(\d{3,4})/);
  if (pair) return `${pair[2]}p`;
  return null;
}

export function extensionFor(kind: MediaKind, filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]{2,4})$/);
  if (match) return match[1];
  if (kind === "audio") return "mp3";
  if (kind === "image") return "jpg";
  return "mp4";
}

export function groupsOf(files: MediaFile[]): MediaFile[][] {
  const map = new Map<string, MediaFile[]>();
  for (const file of files) {
    const list = map.get(file.groupId) ?? [];
    list.push(file);
    map.set(file.groupId, list);
  }
  return [...map.values()];
}
