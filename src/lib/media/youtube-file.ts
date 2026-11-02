import { safeFilename, youtubeThumb, type MediaResult, type Quality } from "@/lib/media/model";

const FILE_API = "https://api5.apiapi2.lat";

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

function mp4Quality(quality: Quality): string {
  if (quality === "480") return "360";
  if (quality === "720") return "720";
  return "720";
}

type Job = { s?: string; i?: string; pk?: string | number; t?: string; e?: boolean };

async function postJson(url: string, body: unknown): Promise<Job | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
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

export async function youtubeVideoFile(pageUrl: string, quality: Quality): Promise<MediaResult | null> {
  const chosen = mp4Quality(quality);
  const init = await postJson(`${FILE_API}/${ranHash()}/init/${encUrl(pageUrl)}/${ranHash()}/`, {
    data: xor1(pageUrl),
    format: "1",
    referer: "https://y2mate.ws/",
    mp3Quality: "128",
    mp4Quality: chosen,
    userTimeZone: "-420",
  });
  if (!init?.i) return null;
  let pk = init.pk ? String(init.pk) : "";
  let title = typeof init.t === "string" ? init.t : "";
  let ready = init.s === "C";
  for (let attempt = 0; attempt < 24 && !ready; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const status = await postJson(
      `${FILE_API}/${ranHash()}/status/${init.i}/${ranHash()}/${pk ? `${pk}/` : ""}`,
      { data: init.i },
    );
    if (!status) continue;
    if (status.pk) pk = String(status.pk);
    if (typeof status.t === "string" && status.t.trim()) title = status.t.trim();
    if (status.e) return null;
    if (status.s && status.s !== "P") ready = status.s === "C";
    if (status.s && status.s !== "P" && status.s !== "C") return null;
  }
  if (!ready) return null;
  const downloadUrl = `${FILE_API}/${ranHash()}/download/${init.i}/${ranHash()}/${pk ? `${pk}/` : ""}`;
  if (!(await fileIsVideo(downloadUrl))) return null;
  const safeTitle = title || "YouTube video";
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
        label: `${chosen}p`,
        detail: "H.264 · full sound",
        filename: safeFilename(`${safeTitle} (${chosen}p).mp4`, "video.mp4"),
        url: downloadUrl,
        save: "navigate",
        expiresSoon: true,
        preview: false,
      },
    ],
  };
}

async function fileIsVideo(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-31" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return false;
    const type = response.headers.get("content-type") || "";
    const reader = response.body?.getReader();
    const first = await reader?.read();
    await reader?.cancel();
    const bytes = first?.value ?? new Uint8Array();
    const mark = String.fromCharCode(...bytes.slice(0, 16));
    return type.includes("video") || mark.includes("ftyp");
  } catch {
    return false;
  }
}
