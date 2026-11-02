import { createServerFn } from "@tanstack/react-start";
import {
  detectPlatform,
  extractUrl,
  unwrapLink,
  canonicalMediaUrl,
  isWeakTitle,
  extensionFor,
  instagramCode,
  kindFromFilename,
  hostLabel,
  platformLabel,
  resolutionFromName,
  safeFilename,
  toUrl,
  xStatusId,
  type FetchMode,
  type MediaFile,
  type MediaResult,
  type Platform,
  type Quality,
  type ResolveInput,
  type ResolveResponse,
} from "@/lib/media/model";
import { youtubeVideoFile } from "@/lib/media/youtube-file";

const APP_UA = "Canister/1.0 (public media fetch)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const COBALT_INSTANCES = ["https://rue-cobalt.xenon.zone/", "https://cobaltapi.cjs.nz/"];

type CobaltBody = {
  status?: string;
  url?: string;
  filename?: string;
  audio?: string;
  audioFilename?: string;
  picker?: Array<{ type?: string; url?: string; thumb?: string }>;
  error?: { code?: string };
};

export const resolveLink = createServerFn({ method: "POST" })
  .validator((data: unknown): ResolveInput => {
    if (!data || typeof data !== "object") {
      throw new Error("Paste a link first.");
    }
    const record = data as Record<string, unknown>;
    const url = typeof record.url === "string" ? extractUrl(record.url) : "";
    const mode: FetchMode = record.mode === "audio" ? "audio" : "video";
    const quality = normalizeQuality(record.quality);
    if (!url || !toUrl(url) || !detectPlatform(url)) {
      throw new Error("Paste a public http link. Private addresses are skipped.");
    }
    return { url, mode, quality };
  })
  .handler(async ({ data }): Promise<ResolveResponse> => {
    try {
      return { ok: true, media: await resolveMedia(data) };
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Couldn't pull a file from that link.";
      return { ok: false, error: message };
    }
  });

async function resolveMedia(input: ResolveInput): Promise<MediaResult> {
  const pageUrl = canonicalMediaUrl(await canonicalPage(input.url));
  const media = await resolveScoped({ ...input, url: pageUrl });
  return { ...media, pageUrl, platform: detectPlatform(pageUrl) ?? media.platform };
}

async function resolveScoped(input: ResolveInput): Promise<MediaResult> {
  const platform = detectPlatform(input.url);
  if (!platform) throw new Error("Paste a public link. Private addresses are skipped.");

  if (platform === "youtube" && input.mode === "video") {
    const file = await youtubeVideoFile(input.url, input.quality);
    if (file && file.files.length > 0) return file;
  }

  if (platform === "x" && input.mode === "video") {
    const direct = await resolveX(input.url);
    if (direct && direct.files.length > 0) return direct;
  }

  if (platform === "x" && input.mode === "audio") {
    const [meta, cobalt] = await Promise.all([
      resolveX(input.url).catch(() => null),
      resolveCobalt(input, platform).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    ]);
    if (!cobalt.ok) {
      if (meta && meta.files.length > 0) {
        return {
          ...meta,
          hint: "audio-fallback",
        };
      }
      throw cobalt.error instanceof Error
        ? cobalt.error
        : new Error("Couldn't pull audio from that post.");
    }
    if (meta) {
      return {
        ...cobalt.value,
        title: cobalt.value.title || meta.title,
        author: meta.author || cobalt.value.author,
        thumbnail: meta.thumbnail || cobalt.value.thumbnail,
        durationSec: meta.durationSec ?? cobalt.value.durationSec,
      };
    }
    return cobalt.value;
  }

  try {
    return await resolveCobalt(input, platform);
  } catch (cobaltError) {
    const fallback =
      platform === "instagram"
        ? await resolveInstagramPage(input.url)
        : platform === "facebook"
          ? await resolveFacebookPage(input.url)
          : platform === "x"
            ? await resolveX(input.url)
            : null;
    if (fallback && fallback.files.length > 0) return fallback;
    throw cobaltError;
  }
}

async function resolveX(raw: string): Promise<MediaResult | null> {
  const id = xStatusId(raw);
  if (!id) return null;
  const endpoints = [
    `https://api.fxtwitter.com/status/${id}`,
    `https://api.vxtwitter.com/status/${id}`,
  ];
  for (const endpoint of endpoints) {
    const json = await fetchJson(endpoint, 12000, APP_UA);
    const tweet = asRecord(json?.tweet);
    if (!tweet) continue;
    const parsed = mediaFromTweet(tweet, id);
    if (parsed) return parsed;
  }
  return null;
}

function mediaFromTweet(tweet: Record<string, unknown>, id: string): MediaResult | null {
  const author = asRecord(tweet.author);
  const name = stringOf(author?.name) || stringOf(author?.screen_name) || "X";
  const handle = stringOf(author?.screen_name);
  const text = stringOf(tweet.text) || stringOf(tweet.raw_text) || "Post";
  const title = text.replace(/\s+/g, " ").trim().slice(0, 140) || "Post";
  const media = asRecord(tweet.media);
  const files: MediaFile[] = [];
  let thumbnail: string | undefined;
  let durationSec: number | undefined;

  const photos = Array.isArray(media?.photos) ? media.photos : [];
  photos.forEach((photo, index) => {
    const record = asRecord(photo);
    const url = httpsOf(record?.url);
    if (!url) return;
    files.push(
      file({
        id: `x-photo-${index}`,
        groupId: `x-photo-${index}`,
        kind: "image",
        label: "Original",
        detail: "Photo",
        filename: safeFilename(`${handle || "x"}_${id}_${index + 1}.jpg`, `x_${id}.jpg`),
        url,
        save: "blob",
        expiresSoon: false,
        preview: false,
      }),
    );
    thumbnail ??= url;
  });

  const pool = Array.isArray(media?.all)
    ? media.all
    : Array.isArray(media?.videos)
      ? media.videos
      : [];

  const videos = pool
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => !!item && item.type !== "photo");

  videos.forEach((video, index) => {
    if (video.type === "photo") return;
    const groupId = `x-video-${index}`;
    const thumb = httpsOf(video.thumbnail_url);
    if (thumb) thumbnail ??= thumb;
    const duration = numberOf(video.duration);
    if (duration) durationSec ??= duration;
    const variants = Array.isArray(video.formats)
      ? video.formats
      : Array.isArray(video.variants)
        ? video.variants
        : [];
    const mp4s = variants
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => !!item)
      .map((item) => {
        const url = httpsOf(item.url);
        const container = (stringOf(item.container) || stringOf(item.content_type) || "").toLowerCase();
        const bitrate = numberOf(item.bitrate) ?? 0;
        if (!url || container.includes("m3u8") || container.includes("mpegurl") || url.includes(".m3u8")) {
          return null;
        }
        if (container && !container.includes("mp4") && !url.includes(".mp4")) return null;
        const height = heightOf(url);
        return { url, bitrate, height };
      })
      .filter((item): item is { url: string; bitrate: number; height: number | null } => !!item)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || b.bitrate - a.bitrate);

    const seen = new Set<string>();
    mp4s.forEach((item, fileIndex) => {
      if (seen.has(item.url)) return;
      seen.add(item.url);
      const heightLabel = item.height ? `${item.height}p` : "MP4";
      const bytes = item.bitrate && duration ? Math.round((item.bitrate / 8) * duration) : undefined;
      const rate = item.bitrate ? `${(item.bitrate / 1_000_000).toFixed(1)} Mbps` : "MP4";
      files.push(
        file({
          id: `${groupId}-${fileIndex}`,
          groupId,
          kind: "video",
          label: heightLabel,
          detail: rate,
          filename: safeFilename(
            `${handle || "x"}_${id}_${heightLabel}.mp4`,
            `x_${id}.mp4`,
          ),
          url: item.url,
          bytes,
          save: "blob",
          expiresSoon: false,
          preview: true,
        }),
      );
    });
  });

  if (files.length === 0) return null;
  return {
    platform: "x",
    title,
    author: handle ? `${name} · @${handle}` : name,
    thumbnail,
    durationSec,
    files,
  };
}

async function resolveCobalt(input: ResolveInput, platform: Platform): Promise<MediaResult> {
  const metaPromise = pageMeta(input.url, platform);
  const ladder = qualityLadder(input.quality, input.mode);
  let lastError = "Couldn't pull a file from that link. Check that it's public and try again.";
  let lastCode = "";

  const attempts = [
    ...COBALT_INSTANCES.map((instance) => ({ instance, qualities: ladder, betterAudio: true })),
    { instance: COBALT_INSTANCES[0], qualities: ladder, betterAudio: false },
  ];

  for (const attempt of attempts) {
    for (const quality of attempt.qualities) {
      let body: CobaltBody;
      try {
        body = await postCobalt(attempt.instance, input.url, input.mode, quality, attempt.betterAudio);
      } catch {
        lastCode = "timeout";
        lastError = "The save service timed out. Try again in a moment.";
        break;
      }
      if (body.status === "error" || !body.status) {
        const code = body.error?.code ?? "";
        lastCode = code;
        lastError = humanize(code, platform);
        if (isFormatMiss(code) || code.toLowerCase().includes("youtube.login")) continue;
        if (isHardStop(code)) throw new Error(lastError);
        break;
      }
      if (body.status === "local-processing") {
        lastError = "That source needs a remix step this save couldn't finish. Try 1080p or audio.";
        continue;
      }
      const meta = await metaPromise;
      const media = cobaltToMedia(body, platform, input, meta);
      if (!media || media.files.length === 0) {
        lastError = "No public file was found at that link.";
        continue;
      }
      const marker = (body.filename || "").toLowerCase();
      if (platform === "youtube" && marker.includes(", facebook")) continue;
      if (platform === "facebook" && marker.includes(", youtube")) continue;
      const primary = media.files[0];
      if (primary && !(await tunnelHasBytes(primary.url))) {
        lastCode = "error.api.youtube.empty";
        lastError = "YouTube did not send the video file. Try again in a moment.";
        continue;
      }
      return media;
    }
  }

  if (instanceBusy(lastCode) && platform === "youtube") {
    const meta = await metaPromise;
    if (meta?.title) {
      throw new Error("That public video is available, but the save step is busy. Try again in a moment.");
    }
  }

  throw new Error(lastError);
}

async function postCobalt(
  instance: string,
  url: string,
  mode: FetchMode,
  quality: string,
  betterAudio: boolean,
): Promise<CobaltBody> {
  const response = await fetch(instance, {
    method: "POST",
    redirect: "follow",
    signal: AbortSignal.timeout(mode === "audio" ? 22000 : 38000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": APP_UA,
    },
    body: JSON.stringify({
      url,
      videoQuality: quality === "max" ? "max" : quality,
      downloadMode: mode === "audio" ? "audio" : "auto",
      ...(mode === "audio" ? { audioFormat: "mp3", audioBitrate: "320" } : {}),
      filenameStyle: "pretty",
      localProcessing: "disabled",
      ...(detectPlatform(url) === "youtube"
        ? {
            youtubeVideoCodec: "h264",
            youtubeVideoContainer: "mp4",
            youtubeBetterAudio: mode === "video" && betterAudio,
          }
        : {}),
      ...(detectPlatform(url) === "tiktok" && mode === "video" ? { tiktokFullAudio: true } : {}),
    }),
  });
  if (response.status === 429) {
    return { status: "error", error: { code: "error.api.rate_exceeded" } };
  }
  const text = await response.text();
  if (!text.trim().startsWith("{")) {
    return { status: "error", error: { code: "error.api.unreachable" } };
  }
  return JSON.parse(text) as CobaltBody;
}

function cobaltToMedia(
  body: CobaltBody,
  platform: Platform,
  input: ResolveInput,
  meta: { title?: string; author?: string; thumbnail?: string } | null,
): MediaResult | null {
  const files: MediaFile[] = [];

  if ((body.status === "tunnel" || body.status === "redirect") && body.url && body.filename) {
    const url = httpsOf(body.url);
    if (!url) return null;
    const kind = kindFromFilename(body.filename);
    const resolution = resolutionFromName(body.filename);
    const tunnel = url.includes("/tunnel");
    files.push(
      file({
        id: "primary",
        groupId: "primary",
        kind,
        label: kind === "audio" ? "Audio" : resolution || (input.quality === "max" ? "Max" : `${input.quality}p`),
        detail:
          kind === "audio"
            ? "MP3 · up to 320 kbps"
            : kind === "image"
              ? "Image"
              : tunnel
                ? "H.264 · full sound"
                : "Original file",
        filename: safeFilename(body.filename, `canister.${extensionFor(kind, body.filename)}`),
        url,
        save: "blob",
        expiresSoon: tunnel,
        preview: kind === "video",
      }),
    );
  }

  if (body.status === "picker" && Array.isArray(body.picker)) {
    body.picker.forEach((item, index) => {
      const url = httpsOf(item.url);
      if (!url) return;
      const hinted = item.type === "photo" ? "photo" : item.type;
      const filename = safeFilename(
        `${platform}_${index + 1}.${item.type === "photo" ? "jpg" : "mp4"}`,
        `${platform}_${index + 1}`,
      );
      const kind = kindFromFilename(filename, hinted);
      const tunnel = url.includes("/tunnel");
      files.push(
        file({
          id: `pick-${index}`,
          groupId: `pick-${index}`,
          kind,
          label: kind === "image" ? "Photo" : item.type === "gif" ? "GIF" : "Video",
          detail: kind === "image" ? "Image" : "Full file",
          filename,
          url,
          save: "blob",
          expiresSoon: tunnel,
          preview: kind === "video",
        }),
      );
    });
    const audioUrl = httpsOf(body.audio);
    if (audioUrl) {
      const tunnel = audioUrl.includes("/tunnel");
      files.push(
        file({
          id: "picker-audio",
          groupId: "picker-audio",
          kind: "audio",
          label: "Audio",
          detail: "Sound only",
          filename: safeFilename(body.audioFilename || `${platform}_audio.mp3`, `${platform}_audio.mp3`),
          url: audioUrl,
          save: tunnel ? "navigate" : "blob",
          expiresSoon: tunnel,
          preview: false,
        }),
      );
    }
  }

  if (files.length === 0) return null;

  const titleFromFile = files[0]?.filename.replace(/\.[a-z0-9]{2,4}$/i, "") || "";
  const nice = chooseTitle(meta?.title || titleFromFile, meta?.author, platform, hostLabel(input.url));
  const author =
    meta?.author && !isWeakTitle(meta.author, platform) && meta.author !== nice ? meta.author : "";
  const named = files.map((item, index) => ({
    ...item,
    filename: namedFile(nice, item, index, files.length),
  }));
  const asked = input.quality === "max" ? null : `${input.quality}p`;
  const got = named.map((item) => resolutionFromName(item.filename)).find(Boolean);
  let hint: string | undefined;
  if (input.mode === "video" && asked && got && got !== asked && Number.parseInt(got, 10) < Number.parseInt(asked, 10)) {
    hint = `quality:${asked}:${got}`;
  }
  if (named.every((item) => item.kind === "image") && input.mode === "video" && platform !== "x") {
    hint = "photo";
  }
  if (named.some((item) => item.expiresSoon)) {
    hint = hint ? `${hint}+expires` : "expires";
  }

  return {
    platform,
    title: nice,
    author: author || (platform === "web" ? hostLabel(input.url) : ""),
    thumbnail: meta?.thumbnail || httpsOf(body.picker?.[0]?.thumb),
    hint,
    files: named,
  };
}

async function pageMeta(
  url: string,
  platform: Platform,
): Promise<{ title?: string; author?: string; thumbnail?: string } | null> {
  if (platform === "youtube") return youtubeMeta(url);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "text/html", "User-Agent": BROWSER_UA },
    });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 160000);
    return {
      title: metaContent(html, "og:title") || metaContent(html, "twitter:title"),
      author: metaContent(html, "og:site_name") || metaContent(html, "author"),
      thumbnail: httpsOf(metaContent(html, "og:image")),
    };
  } catch {
    return null;
  }
}

function metaContent(html: string, key: string): string {
  const prop = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i")) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
  return cleanTitle(decodeEscaped(match?.[1] || ""));
}

function chooseTitle(title: string, author: string | undefined, platform: Platform, host: string): string {
  const primary = title.replace(/\s*\([^)]{0,40}\)\s*$/g, "").trim();
  if (primary && !isWeakTitle(primary, platform)) return primary;
  const who = (author || "").trim();
  if (who && !isWeakTitle(who, platform)) return who;
  if (host && !isWeakTitle(host, platform)) return host;
  return platformLabel(platform);
}

function namedFile(title: string, item: MediaFile, index: number, count: number): string {
  const ext = item.filename.split(".").pop()?.toLowerCase() || extensionFor(item.kind, item.filename);
  const quality = resolutionFromName(item.filename);
  const part = count > 1 ? ` ${index + 1}` : "";
  const mark = quality ? ` (${quality})` : "";
  return safeFilename(`${title}${part}${mark}.${ext}`, item.filename);
}

async function youtubeMeta(url: string): Promise<{ title?: string; author?: string; thumbnail?: string } | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json", "User-Agent": APP_UA },
      },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      title: json.title,
      author: json.author_name,
      thumbnail: httpsOf(json.thumbnail_url),
    };
  } catch {
    return null;
  }
}

async function resolveInstagramPage(raw: string): Promise<MediaResult | null> {
  const parsed = instagramCode(raw);
  if (!parsed) return null;
  const paths =
    parsed.kind === "reel"
      ? [`reel/${parsed.code}`, `p/${parsed.code}`]
      : [`p/${parsed.code}`, `reel/${parsed.code}`];
  for (const path of paths) {
    const html = await fetchText(`https://www.instagram.com/${path}/embed/captioned/`, 12000);
    if (!html) continue;
    const decoded = decodeEscaped(html);
    const video = decoded.match(/"video_url":"(https:[^"\\]+)"/);
    const titleMatch = decoded.match(/<title>([^<]{1,180})<\/title>/i);
    if (!video) continue;
    const url = httpsOf(decodeEscaped(video[1]));
    if (!url) continue;
    return {
      platform: "instagram",
      title: cleanTitle(titleMatch?.[1]) || "Instagram",
      author: "Instagram",
      files: [
        file({
          id: "ig-video",
          groupId: "ig-video",
          kind: "video",
          label: "Video",
          detail: "Original",
          filename: safeFilename(`instagram_${parsed.code}.mp4`, "instagram.mp4"),
          url,
          save: "blob",
          expiresSoon: true,
          preview: true,
        }),
      ],
      hint: "expires",
    };
  }
  return null;
}

async function resolveFacebookPage(raw: string): Promise<MediaResult | null> {
  const pageUrl = extractUrl(raw);
  if (detectPlatform(pageUrl) !== "facebook") return null;
  const plugin = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(pageUrl)}&show_text=0&width=1280`;
  const html = await fetchText(plugin, 12000);
  if (!html) return null;
  const decoded = decodeEscaped(html);
  const patterns = [
    /"browser_native_hd_url":"(https:[^"]+)"/,
    /"playable_url_quality_hd":"(https:[^"]+)"/,
    /"browser_native_sd_url":"(https:[^"]+)"/,
    /"playable_url":"(https:[^"]+)"/,
    /hd_src:"(https:[^"]+)"/,
    /sd_src:"(https:[^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    const url = httpsOf(match?.[1]);
    if (!url) continue;
    const hd = pattern.source.includes("hd");
    return {
      platform: "facebook",
      title: "Facebook video",
      author: "Facebook",
      files: [
        file({
          id: "fb-video",
          groupId: "fb-video",
          kind: "video",
          label: hd ? "HD" : "SD",
          detail: "Original",
          filename: "facebook_video.mp4",
          url,
          save: "blob",
          expiresSoon: true,
          preview: true,
        }),
      ],
      hint: "expires",
    };
  }
  return null;
}

function qualityLadder(quality: Quality, mode: FetchMode): string[] {
  if (mode === "audio") return ["1080", "720"];
  if (quality === "max" || quality === "1080") return ["1080", "720", "480", "360"];
  if (quality === "720") return ["720", "480", "360"];
  if (quality === "480") return ["480", "360", "720"];
  return ["480", "360"];
}

async function tunnelHasBytes(url: string): Promise<boolean> {
  if (!url.includes("/tunnel")) return true;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": APP_UA },
    });
    const length = response.headers.get("content-length");
    const estimated = response.headers.get("estimated-content-length");
    await response.body?.cancel();
    if (length === "0" || estimated === "-1") return false;
    return response.ok;
  } catch {
    return false;
  }
}

function humanize(code: string, platform: Platform): string {
  const value = code.toLowerCase();
  const name = platformLabel(platform);
  if (value.includes("live")) return "Live streams can't be saved. Use the replay once it's posted.";
  if (value.includes("too_long") || value.includes("duration")) {
    return "That video is too long for a fast save. Try a shorter clip, or switch to audio.";
  }
  if (value.includes("unsupported") || value.includes("link.invalid")) {
    return "No public file was found on that link. Try the post itself, not a profile or a private page.";
  }
  if (value.includes("api.youtube.login") || value.includes("api.auth")) {
    return "That public video is available, but the save step is busy. Try again in a moment.";
  }
  if (value.includes("age")) return "This video is age-restricted, so it can't be saved from here.";
  if (value.includes("content.private") || value.includes("content.login") || value.includes("private")) {
    return `${name} wouldn't hand over a public file. Private and login-only posts are skipped.`;
  }
  if (value.includes("empty") || value.includes("unavailable") || value.includes("not_found")) {
    return "No public file was found. Copy the link to the post itself, not a profile or a search page.";
  }
  if (value.includes("rate") || value.includes("auth") || value.includes("unreachable")) {
    return "The save service is busy right now. Try again in a moment.";
  }
  return "Couldn't pull a file from that link. Check that it's public and try again.";
}

function instanceBusy(code: string): boolean {
  const value = code.toLowerCase();
  return value.includes("api.youtube.login") || value.includes("api.auth") || value.includes("rate") || value === "timeout";
}

function isFormatMiss(code: string): boolean {
  return code.toLowerCase().includes("no_matching_format");
}

function isHardStop(code: string): boolean {
  const value = code.toLowerCase();
  return (
    value.includes("unsupported") ||
    value.includes("link.invalid") ||
    value.includes("live") ||
    value.includes("too_long") ||
    value.includes("age")
  );
}

function normalizeQuality(value: unknown): Quality {
  if (value === "max" || value === "720" || value === "480" || value === "1080") return value;
  return "1080";
}

function file(input: MediaFile): MediaFile {
  return input;
}

function heightOf(url: string): number | null {
  const match = url.match(/\/(\d{2,5})x(\d{2,5})\//);
  if (!match) return null;
  const height = Number(match[2]);
  return Number.isFinite(height) ? height : null;
}

function httpsOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const decoded = decodeEscaped(value);
  if (!decoded.startsWith("https://")) return undefined;
  return decoded;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function decodeEscaped(value: string): string {
  return value
    .replace(/\\u0026/gi, "&")
    .replace(/\\u0025/gi, "%")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&/g, "&");
}

function cleanTitle(value?: string): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").replace(/&/g, "&").trim();
}

async function canonicalPage(raw: string): Promise<string> {
  const unwrapped = unwrapLink(raw);
  const url = toUrl(unwrapped);
  if (!url) return unwrapped;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const short =
    host === "fb.watch" ||
    host.endsWith(".fb.watch") ||
    url.pathname.startsWith("/share/") ||
    url.pathname.startsWith("/share.php");
  if (!short) return canonicalMediaUrl(unwrapped);
  const followed = await followPublic(unwrapped);
  return canonicalMediaUrl(followed);
}

async function followPublic(start: string): Promise<string> {
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "text/html", "User-Agent": BROWSER_UA },
      });
      const location = response.headers.get("location");
      if (!location || response.status < 300 || response.status >= 400) return current;
      const next = unwrapLink(new URL(location, current).toString());
      const parsed = toUrl(next);
      if (!parsed || !detectPlatform(next)) return current;
      if (parsed.pathname.startsWith("/login")) return start;
      current = next;
    } catch {
      return current;
    }
  }
  return current;
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json", "User-Agent": userAgent },
    });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    return asRecord(json);
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "text/html",
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en",
      },
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > 2_000_000) return text.slice(0, 2_000_000);
    return text;
  } catch {
    return null;
  }
}
