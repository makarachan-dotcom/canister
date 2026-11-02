import type { MediaFile } from "@/lib/media/model";

const BLOB_CAP = 160 * 1024 * 1024;

export async function saveFile(
  file: MediaFile,
  onProgress: (ratio: number | null) => void,
  signal: AbortSignal,
): Promise<"saved" | "opened"> {
  if (file.save === "navigate") {
    triggerAnchor(file.url, file.filename, true);
    return "opened";
  }

  try {
    const response = await fetch(file.url, { signal, referrerPolicy: "no-referrer" });
    if (!response.ok || !response.body) throw new Error("fetch failed");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > BLOB_CAP) {
      triggerAnchor(file.url, file.filename, false);
      return "opened";
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > BLOB_CAP) {
        await reader.cancel();
        triggerAnchor(file.url, file.filename, false);
        return "opened";
      }
      chunks.push(value);
      onProgress(length > 0 ? received / length : null);
    }

    const type = mediaType(response.headers.get("content-type"), file.kind, chunks[0]);
    if (!realMedia(chunks, file.kind)) {
      throw new Error("empty-video");
    }
    const blob = new Blob(chunks as BlobPart[], { type });
    const shared = await shareFile(blob, file.filename, type);
    if (shared) return "saved";
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, file.filename, false);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 20000);
    return "saved";
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof Error && error.message === "empty-video") throw error;
    triggerAnchor(file.url, file.filename, file.kind !== "video");
    return "opened";
  }
}

function mediaType(header: string | null, kind: MediaFile["kind"], sample?: Uint8Array): string {
  if (header && !header.includes("text/html") && !header.includes("application/json") && header !== "application/octet-stream") {
    return header.split(";")[0] || octet(kind);
  }
  if (sample && String.fromCharCode(...sample.subarray(0, 16)).includes("ftyp")) return "video/mp4";
  return octet(kind);
}

function realMedia(chunks: Uint8Array[], kind: MediaFile["kind"]): boolean {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (size < 2048) return false;
  const sample = chunks[0]?.subarray(0, 32);
  if (!sample || sample.length < 12) return false;
  const mark = String.fromCharCode(...sample);
  if (mark.includes("ftyp") || mark.startsWith("ID3") || mark.startsWith("OggS") || mark.startsWith("RIFF") || mark.startsWith("GIF8")) {
    return true;
  }
  if (sample[0] === 0x1a && sample[1] === 0x45 && sample[2] === 0xdf) return true;
  if (sample[0] === 0xff && sample[1] === 0xd8) return true;
  if (sample[0] === 0x89 && sample[1] === 0x50) return true;
  if (sample[0] === 0xff && (sample[1] & 0xe0) === 0xe0) return true;
  if (mark.trimStart().startsWith("<") || mark.trimStart().startsWith("{")) return false;
  return kind !== "video";
}

async function shareFile(blob: Blob, filename: string, type: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const phone = /iPhone|iPad|Android/i.test(navigator.userAgent);
  if (!phone || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  const file = new File([blob], filename, { type });
  const data = { files: [file], title: filename };
  if (!nav.canShare(data)) return false;
  try {
    await nav.share(data);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return true;
    return false;
  }
}

function octet(kind: MediaFile["kind"]): string {
  if (kind === "audio") return "audio/mpeg";
  if (kind === "image") return "image/jpeg";
  return "video/mp4";
}

function triggerAnchor(href: string, filename: string, blank: boolean) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  if (blank) {
    anchor.target = "_blank";
    anchor.rel = "noopener";
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
