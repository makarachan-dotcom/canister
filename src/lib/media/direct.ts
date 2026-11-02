import {
  canonicalMediaUrl,
  detectPlatform,
  kindFromFilename,
  platformLabel,
  resolutionFromName,
  safeFilename,
  youtubeThumb,
  type FetchMode,
  type MediaResult,
  type Quality,
} from "@/lib/media/model";

const DIRECT = "https://rue-cobalt.xenon.zone/";

export async function browserResolve(input: {
  url: string;
  mode: FetchMode;
  quality: Quality;
}): Promise<MediaResult | null> {
  const pageUrl = canonicalMediaUrl(input.url);
  const platform = detectPlatform(pageUrl);
  if (!platform) return null;
  const ladder: string[] =
    input.mode === "audio"
      ? ["1080", "720"]
      : input.quality === "480"
        ? ["480", "360", "720"]
        : input.quality === "720"
          ? ["720", "480", "360", "1080"]
          : ["1080", "720", "480", "360"];

  let fallbackTitle = "";
  for (const quality of ladder) {
    const body = await postDirect(pageUrl, input.mode, quality, platform === "youtube");
    if (!body) continue;
    if (body.error === "rate") break;
    if (body.status === "picker" && body.picker?.length) {
      return pickerResult(body, platform, pageUrl);
    }
    if (!body.url || !body.filename) continue;
    if (body.status !== "tunnel" && body.status !== "redirect") continue;
    if (!body.url.startsWith("https://")) continue;
    const rawName = safeFilename(body.filename, "video.mp4");
    const resolution = resolutionFromName(rawName);
    const { title, author } = presentName(rawName, platformLabel(platform));
    fallbackTitle = title;
    if (!(await fileHasBytes(body.url))) continue;
    const ext = rawName.split(".").pop() || "mp4";
    const filename = safeFilename(`${title}${resolution ? ` (${resolution})` : ""}.${ext}`, rawName);
    const kind = kindFromFilename(filename);
    const tunnel = body.url.includes("/tunnel");
    return {
      platform,
      title,
      author,
      pageUrl,
      thumbnail: platform === "youtube" ? youtubeThumb(pageUrl) : undefined,
      hint: tunnel ? "expires" : undefined,
      files: [
        {
          id: "primary",
          groupId: "primary",
          kind,
          label: kind === "audio" ? "Audio" : resolution || `${quality}p`,
          detail: kind === "audio" ? "Sound only" : tunnel ? "H.264 · full sound" : "Original file",
          filename,
          url: body.url,
          save: "blob",
          expiresSoon: tunnel,
          preview: kind === "video",
        },
      ],
    };
  }
  if (platform === "youtube" && fallbackTitle) {
    return {
      platform,
      title: fallbackTitle,
      author: "",
      pageUrl,
      thumbnail: youtubeThumb(pageUrl),
      files: [],
    };
  }
  return null;
}

async function fileHasBytes(url: string): Promise<boolean> {
  if (!url.includes("/tunnel")) return true;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const length = response.headers.get("content-length");
    const estimated = response.headers.get("estimated-content-length");
    await response.body?.cancel();
    if (length === "0" || estimated === "-1") return false;
    return response.ok;
  } catch {
    return false;
  }
}

function presentName(filename: string, fallback: string): { title: string; author: string } {
  const raw = filename.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/\s*\([^)]*\)\s*$/g, "").trim();
  const tiktok = raw.match(/^tiktok_([A-Za-z0-9._]+)_(\d{6,})$/i);
  if (tiktok) return { title: `@${tiktok[1]}`, author: "TikTok" };
  if (/^(?:twitter|x)_\d{6,}$/i.test(raw)) return { title: "X video", author: "" };
  const dash = raw.lastIndexOf(" - ");
  if (dash > 0) return { title: raw.slice(0, dash).trim(), author: raw.slice(dash + 3).trim() };
  return { title: raw || fallback, author: "" };
}

function pickerResult(
  body: DirectBody,
  platform: MediaResult["platform"],
  pageUrl: string,
): MediaResult {
  const files = (body.picker ?? []).flatMap((item, index) => {
    if (!item.url?.startsWith("https://")) return [];
    const photo = item.type === "photo" || item.type === "image";
    const filename = safeFilename(`${platformLabel(platform)} ${index + 1}.${photo ? "jpg" : "mp4"}`, `${platform}-${index + 1}.mp4`);
    return [
      {
        id: `pick-${index}`,
        groupId: `pick-${index}`,
        kind: photo ? ("image" as const) : ("video" as const),
        label: photo ? "Photo" : "Video",
        detail: photo ? "Image" : "Full file",
        filename,
        url: item.url,
        save: "blob" as const,
        expiresSoon: item.url.includes("/tunnel"),
        preview: !photo && !item.url.includes("/tunnel"),
      },
    ];
  });
  return {
    platform,
    title: platformLabel(platform),
    author: "",
    pageUrl,
    hint: files.some((item) => item.expiresSoon) ? "expires" : undefined,
    files,
  };
}

type DirectBody = {
  status?: string;
  url?: string;
  filename?: string;
  error?: string;
  picker?: Array<{ url?: string; type?: string }>;
};

async function postDirect(
  url: string,
  mode: FetchMode,
  quality: string,
  youtube: boolean,
): Promise<DirectBody | null> {
  try {
    const response = await fetch(DIRECT, {
      method: "POST",
      signal: AbortSignal.timeout(28000),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        videoQuality: quality,
        downloadMode: mode === "audio" ? "audio" : "auto",
        filenameStyle: "pretty",
        localProcessing: "disabled",
        ...(mode === "audio" ? { audioFormat: "mp3", audioBitrate: "320" } : {}),
        ...(youtube
          ? { youtubeVideoCodec: "h264", youtubeVideoContainer: "mp4", youtubeBetterAudio: mode === "video" }
          : {}),
      }),
    });
    if (response.status === 429) return { error: "rate" };
    if (!response.ok && response.status !== 400) return null;
    const json: unknown = await response.json();
    if (!json || typeof json !== "object") return null;
    const record = json as { status?: string; url?: string; filename?: string; picker?: DirectBody["picker"]; error?: { code?: string } };
    if (record.error?.code?.includes("rate")) return { error: "rate" };
    return { status: record.status, url: record.url, filename: record.filename, picker: record.picker };
  } catch {
    return null;
  }
}
