import { safeFilename, youtubeThumb, type MediaResult, type Quality } from "@/lib/media/model";

const FILE_API = "https://api5.apiapi2.lat";

export type YoutubeJob = { id: string; pk: string; title: string };

export type YoutubeTick =
  | { state: "wait"; title: string; pk: string }
  | { state: "ready"; media: MediaResult }
  | { state: "fail" };

function xor1(value: string): string {
  return Array.from(value, (char) => String.fromCharCode(char.charCodeAt(0) ^ 1)).join("");
}

function encUrl(value: string): string {
  return Array.from(value, (char) => String(char.charCodeAt(0)))
    .reverse()
    .join(",");
}

function ranHash(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function youtubeFileQuality(quality: Quality): "360" | "720" {
  return quality === "480" ? "360" : "720";
}

type Job = { s?: string; i?: string; pk?: string | number; t?: string; e?: boolean };

async function postJson(url: string, body: unknown): Promise<Job | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        "Content-Type": "application/json",
        Origin: "https://y2mate.ws",
        Referer: "https://y2mate.ws/",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    if (!json || typeof json !== "object") return null;
    return json as Job;
  } catch {
    return null;
  }
}

function asMedia(pageUrl: string, quality: "360" | "720", id: string, pk: string, title: string): MediaResult {
  const safeTitle = title || "YouTube video";
  const downloadUrl = `${FILE_API}/${ranHash()}/download/${id}/${ranHash()}/${pk ? `${pk}/` : ""}`;
  return {
    platform: "youtube",
    title: safeTitle,
    author: "",
    pageUrl,
    thumbnail: youtubeThumb(pageUrl),
    hint: "expires",
    files: [
      {
        id: "primary",
        groupId: "primary",
        kind: "video",
        label: `${quality}p`,
        detail: "H.264 · full sound",
        filename: safeFilename(`${safeTitle} (${quality}p).mp4`, "video.mp4"),
        url: downloadUrl,
        save: "navigate",
        expiresSoon: true,
        preview: false,
      },
    ],
  };
}

export async function openYoutubeJob(pageUrl: string, quality: Quality): Promise<YoutubeJob | null> {
  const chosen = youtubeFileQuality(quality);
  const init = await postJson(`${FILE_API}/${ranHash()}/init/${encUrl(pageUrl)}/${ranHash()}/`, {
    data: xor1(pageUrl),
    format: "1",
    referer: "https://y2mate.ws/",
    mp3Quality: "128",
    mp4Quality: chosen,
    userTimeZone: "-420",
  });
  if (!init?.i) return null;
  return { id: init.i, pk: init.pk ? String(init.pk) : "", title: typeof init.t === "string" ? init.t.trim() : "" };
}

export async function tickYoutubeJob(pageUrl: string, quality: Quality, id: string, pk: string): Promise<YoutubeTick> {
  const chosen = youtubeFileQuality(quality);
  const status = await postJson(`${FILE_API}/${ranHash()}/status/${id}/${ranHash()}/${pk ? `${pk}/` : ""}`, { data: id });
  if (!status) return { state: "wait", title: "", pk };
  const nextPk = status.pk ? String(status.pk) : pk;
  const title = typeof status.t === "string" ? status.t.trim() : "";
  if (status.e || (status.s && status.s !== "P" && status.s !== "C")) return { state: "fail" };
  if (status.s === "C") return { state: "ready", media: asMedia(pageUrl, chosen, id, nextPk, title) };
  return { state: "wait", title, pk: nextPk };
}

export async function youtubeVideoFile(pageUrl: string, quality: Quality): Promise<MediaResult | null> {
  const opened = await openYoutubeJob(pageUrl, quality);
  if (!opened) return null;
  let pk = opened.pk;
  let title = opened.title;
  for (let attempt = 0; attempt < 70; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 700));
    const tick = await tickYoutubeJob(pageUrl, quality, opened.id, pk);
    if (tick.state === "fail") return null;
    if (tick.state === "ready") {
      if (title && tick.media.title === "YouTube video") tick.media.title = title;
      return tick.media;
    }
    if (tick.state === "wait" && tick.pk) pk = tick.pk;
    if (tick.state === "wait" && tick.title) title = tick.title;
  }
  return null;
}
