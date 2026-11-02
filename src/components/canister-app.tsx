import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Link2, Music, RotateCcw } from "lucide-react";
import { COPY, type Copy, type Lang } from "@/lib/media/copy";
import {
  SAMPLE_URL,
  detectPlatform,
  extractUrl,
  formatBytes,
  formatDuration,
  groupsOf,
  platformLabel,
  unwrapLink,
  youtubeId,
  type FetchMode,
  type MediaFile,
  type MediaResult,
  type Platform,
  type Quality,
} from "@/lib/media/model";
import { resolveLink } from "@/lib/media/resolve";
import { browserResolve } from "@/lib/media/direct";
import { saveFile } from "@/lib/media/save";

const HISTORY_KEY = "canister.history.v1";
const LANG_KEY = "canister.lang";

const QUALITY_IDS: Quality[] = ["1080", "max", "720", "480"];

type HistoryItem = {
  url: string;
  title: string;
  platform: Platform;
  at: number;
};

type Step = 1 | 2 | 3;

export function CanisterApp() {
  const resolve = useServerFn(resolveLink);
  const [lang, setLang] = useState<Lang>("km");
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<FetchMode>("video");
  const [quality, setQuality] = useState<Quality>("1080");
  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saveNote, setSaveNote] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [resolvedFor, setResolvedFor] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const text = COPY[lang];
  const platform = detectPlatform(raw);

  useEffect(() => {
    try {
      const storedLang = localStorage.getItem(LANG_KEY);
      if (storedLang === "en" || storedLang === "km") setLang(storedLang);
      const stored = localStorage.getItem(HISTORY_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as HistoryItem[];
      if (Array.isArray(parsed)) setHistory(parsed.slice(0, 6));
    } catch {
      /* ignore broken local storage */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "km" ? "km" : "en";
  }, [lang]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const groups = useMemo(() => (media ? groupsOf(media.files) : []), [media]);

  function chooseLang(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* private mode */
    }
  }

  function goNext() {
    const url = unwrapLink(raw);
    if (!extractUrl(raw)) {
      setPhase("error");
      setError(text.emptyPaste);
      return;
    }
    if (!detectPlatform(url)) {
      setPhase("error");
      setError(text.badLink);
      return;
    }
    if (url !== resolvedFor) {
      setMedia(null);
      setPhase("idle");
    }
    setRaw(url);
    setError("");
    setPhase("idle");
    setStep(2);
  }

  async function pull(nextUrl?: string) {
    const url = unwrapLink(nextUrl ?? raw);
    if (!extractUrl(nextUrl ?? raw)) {
      setStep(1);
      setPhase("error");
      setError(text.emptyPaste);
      setMedia(null);
      return;
    }
    if (!detectPlatform(url)) {
      setStep(1);
      setPhase("error");
      setError(text.badLink);
      setMedia(null);
      return;
    }
    setRaw(url);
    const ticket = ++requestRef.current;
    setPhase("loading");
    setError("");
    setSaveNote("");
    setMedia(null);
    try {
      const direct = await browserResolve({ url, mode, quality });
      if (ticket !== requestRef.current) return;
      let result = direct;
      if (!result || (result.files.length === 0 && result.platform !== "youtube")) {
        const server = await resolve({ data: { url, mode, quality } });
        if (ticket !== requestRef.current) return;
        if (!server.ok) {
          setPhase("error");
          setError(explainError(server.error, text));
          setStep(2);
          return;
        }
        result = server.media;
      }
      const shown = result.pageUrl || url;
      setMedia(result);
      setRaw(shown);
      setResolvedFor(shown);
      const initial: Record<string, string> = {};
      for (const group of groupsOf(result.files)) {
        if (group[0]) initial[group[0].groupId] = group[0].id;
      }
      setPicked(initial);
      setPhase("ready");
      setStep(3);
      remember(result, shown);
    } catch (caught) {
      if (ticket !== requestRef.current) return;
      setPhase("error");
      setStep(2);
      setError(explainError(caught instanceof Error ? caught.message : text.badLink, text));
    }
  }

  function remember(result: MediaResult, url: string) {
    const next: HistoryItem[] = [
      { url, title: result.title, platform: result.platform, at: Date.now() },
      ...history.filter((item) => item.url !== url),
    ].slice(0, 6);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }

  async function onSave(file: MediaFile) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSavingId(file.id);
    setProgress(0);
    setSaveNote("");
    try {
      const outcome = await saveFile(file, setProgress, controller.signal);
      setSaveNote(outcome === "saved" ? text.saved : file.expiresSoon ? text.saveRetry : text.opened);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setSaveNote(explainError(caught instanceof Error ? caught.message : text.saveRetry, text));
      }
    } finally {
      if (abortRef.current === controller) {
        setSavingId(null);
        setProgress(null);
      }
    }
  }

  async function onSaveAll(nextGroups: MediaFile[][], selection: Record<string, string>) {
    const files = nextGroups
      .map((group) => group.find((item) => item.id === selection[item.groupId]) ?? group[0])
      .filter((item): item is MediaFile => Boolean(item));
    for (const file of files) {
      await onSave(file);
    }
    setSaveNote(files.length > 1 ? text.savedMany(files.length) : text.saved);
  }

  function startFresh() {
    abortRef.current?.abort();
    requestRef.current += 1;
    setRaw("");
    setMedia(null);
    setResolvedFor("");
    setError("");
    setSaveNote("");
    setPhase("idle");
    setStep(1);
    setMode("video");
    setQuality("1080");
  }

  const currentLink = unwrapLink(raw);
  const sameLink = Boolean(media) && currentLink === resolvedFor;
  const statusLine = mode === "audio" ? text.extracting : phase === "loading" ? text.pulling : text.reading;

  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col px-5 py-8 sm:px-6 sm:py-14">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Mark />
              <h1 className="font-display text-4xl tracking-tight sm:text-5xl">{text.wordmark}</h1>
            </div>
            <p className="mt-4 max-w-sm font-display text-xl leading-snug">{text.tagline}</p>
            <p className="mt-2 text-sm text-muted">{text.quiet}</p>
          </div>
          <div className="flex shrink-0 items-center" role="group" aria-label="Language">
            {(["km", "en"] as Lang[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={lang === item}
                onClick={() => chooseLang(item)}
                className={
                  "h-11 px-2 text-sm font-medium " + (lang === item ? "border-b-2 border-ink text-ink" : "text-muted")
                }
              >
                {item === "km" ? "ខ្មែរ" : "EN"}
              </button>
            ))}
          </div>
        </header>

        <div className="mt-8 h-1 overflow-hidden rounded-full bg-ink/10" aria-hidden>
          <div className={"h-full bg-accent rail " + (step === 1 ? "w-1/3" : step === 2 ? "w-2/3" : "w-full")} />
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-2">
          {text.steps.map((label, index) => {
            const number = (index + 1) as Step;
            const open = number === 1 || (number === 2 && Boolean(platform)) || (number === 3 && sameLink);
            const current = step === number;
            const done = number < step;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!open}
                  aria-current={current ? "step" : undefined}
                  onClick={() => {
                    if (number === 3 && !sameLink) return;
                    setStep(number);
                  }}
                  className="flex w-full min-w-0 flex-col items-center gap-1.5 py-1 disabled:cursor-default"
                >
                  <span
                    className={
                      "grid size-9 place-items-center rounded-full text-sm font-medium press " +
                      (current
                        ? "bg-ink text-surface ring-2 ring-accent ring-offset-2 ring-offset-bg"
                        : done
                          ? "bg-ink/15 text-ink"
                          : "border border-ink/15 bg-surface text-muted")
                    }
                  >
                    {text.numerals[index]}
                  </span>
                  <span className={"max-w-full truncate text-xs font-medium " + (current ? "text-ink" : "text-muted")}>
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {step === 1 ? (
          <section className="panel step-in mt-5 rounded-card p-5 sm:p-7">
            <p className="text-xs font-medium text-muted">{text.s1kicker}</p>
            <h2 className="mt-2 font-display text-3xl">{text.s1title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{text.s1body}</p>
            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                goNext();
              }}
            >
              <label className="text-sm font-medium" htmlFor="link">
                {text.link}
              </label>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-ink/10 bg-bg px-3 focus-within:border-ink">
                <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
                <input
                  id="link"
                  name="link"
                  value={raw}
                  onChange={(event) => {
                    const next = event.target.value;
                    setRaw(next);
                    if (resolvedFor && unwrapLink(next) !== resolvedFor) {
                      setMedia(null);
                      setResolvedFor("");
                    }
                    if (phase === "error") setPhase("idle");
                  }}
                  placeholder={text.placeholder}
                  inputMode="url"
                  enterKeyHint="go"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted"
                />
              </div>
              {platform ? (
                <p className="mt-3 text-sm text-muted">
                  {text.known}
                  <span className="ml-2 inline-flex h-7 items-center rounded-full bg-ink px-3 text-xs font-medium text-surface">
                    {platformLabel(platform)}
                  </span>
                </p>
              ) : null}
              {phase === "error" && step === 1 ? <Alert message={error} /> : null}
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="submit"
                  className="press inline-flex h-14 items-center justify-center rounded-full bg-accent px-5 text-base font-medium text-accent-ink"
                >
                  {text.next}
                </button>
                <button
                  type="button"
                  className="press inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/10 bg-bg px-4 text-sm font-medium"
                  onClick={() => {
                    setRaw(SAMPLE_URL);
                    setError("");
                    setPhase("idle");
                    setStep(2);
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  {text.sample}
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">{text.sampleNote}</p>
            </form>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="panel step-in mt-5 rounded-card p-5 sm:p-7">
            <p className="text-xs font-medium text-muted">{text.s2kicker}</p>
            <h2 className="mt-2 font-display text-3xl">{text.s2title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{text.s2body}</p>
            <p className="mt-4 truncate text-sm text-muted">
              {platform ? `${platformLabel(platform)} · ` : ""}
              {raw}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={text.s2title}>
              {QUALITY_IDS.map((id) => {
                const selected = mode === "video" && quality === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setMode("video");
                      setQuality(id);
                    }}
                    className={
                      "press flex min-h-16 flex-col items-start justify-center rounded-2xl border px-4 py-3 text-left " +
                      (selected ? "border-ink bg-ink text-surface" : "border-ink/10 bg-bg text-ink")
                    }
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {text.qualities[id]}
                      {id === "1080" ? (
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs " +
                            (selected ? "bg-accent text-accent-ink" : "text-accent")
                          }
                        >
                          {text.recommended}
                        </span>
                      ) : null}
                    </span>
                    <span className={"mt-1 text-xs " + (selected ? "text-surface/80" : "text-muted")}>
                      {text.qualityDetail[id]}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-pressed={mode === "audio"}
              onClick={() => setMode("audio")}
              className={
                "press mt-2 flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 text-left " +
                (mode === "audio" ? "border-ink bg-ink text-surface" : "border-ink/10 bg-bg text-ink")
              }
            >
              <Music className="size-4 shrink-0" aria-hidden />
              <span>
                <span className="block text-sm font-medium">{text.audio}</span>
                <span className={"text-xs " + (mode === "audio" ? "text-surface/80" : "text-muted")}>
                  {text.audioDetail}
                </span>
              </span>
            </button>
            {phase === "error" ? <Alert message={error} /> : null}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="press inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink/10 bg-bg px-4 text-sm font-medium"
              >
                <ArrowLeft className="size-4" aria-hidden />
                {text.back}
              </button>
              <span className="orbit min-w-0 flex-1">
                <button
                  type="button"
                  disabled={phase === "loading"}
                  onClick={() => void pull()}
                  className="orbit-btn press inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-medium disabled:opacity-60"
                >
                  {phase === "loading" ? (
                    <>
                      <Sprockets />
                      {statusLine}
                    </>
                  ) : (
                    <>
                      <Download className="size-4" aria-hidden />
                      {text.find}
                    </>
                  )}
                </button>
              </span>
            </div>
          </section>
        ) : null}

        {step === 3 && media ? (
          <section className="panel step-in mt-5 rounded-card p-5 sm:p-7" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">{text.s3kicker}</p>
                <h2 className="mt-2 font-display text-3xl">{text.s3title}</h2>
              </div>
              <button
                type="button"
                onClick={startFresh}
                className="inline-flex h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium text-muted"
              >
                {text.fresh}
              </button>
            </div>
            <p className="mt-3 text-xs font-medium tracking-wide text-muted">
              {platformLabel(media.platform)}
              {media.author ? ` · ${media.author}` : ""}
              {media.durationSec ? ` · ${formatDuration(media.durationSec)}` : ""}
            </p>
            <p className="mt-2 font-display text-2xl">{media.title}</p>
            {media.hint ? <p className="mt-2 text-sm leading-relaxed text-muted">{explainHint(media.hint, text)}</p> : null}
            <WatchStage
              label={text.watchFirst}
              title={media.title}
              pageUrl={media.pageUrl || raw}
              file={groups.flat().find((item) => item.kind === "video")}
              poster={media.thumbnail}
            />
            {media.files.length === 0 ? <Alert message={text.emptyVideo} /> : null}
            {groups.length > 1 ? (
              <button
                type="button"
                disabled={savingId !== null}
                onClick={() => void onSaveAll(groups, picked)}
                className="press mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-ink disabled:opacity-60"
              >
                <Download className="size-4" aria-hidden />
                {text.saveAll(groups.length)}
              </button>
            ) : null}
            <div className="mt-5 flex flex-col gap-6">
              {groups.map((group, index) => (
                <GroupCard
                  key={group[0]?.groupId}
                  index={groups.length > 1 ? index + 1 : 0}
                  filesLabel={text.files}
                  files={group}
                  poster={media.thumbnail}
                  showPlayer={false}
                  selectedId={group[0] ? picked[group[0].groupId] ?? group[0].id : ""}
                  onSelect={(id) => {
                    const groupId = group[0]?.groupId;
                    if (!groupId) return;
                    setPicked((current) => ({ ...current, [groupId]: id }));
                  }}
                  savingId={savingId}
                  progress={progress}
                  copy={text}
                  onSave={(file) => void onSave(file)}
                />
              ))}
            </div>
            {saveNote ? <p className="fade-in mt-4 text-sm leading-relaxed text-muted">{saveNote}</p> : null}
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-4 inline-flex h-11 items-center gap-2 text-sm font-medium text-muted"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {text.back}
            </button>
          </section>
        ) : null}

        {step === 1 && history.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-muted">{text.recent}</h2>
            <ul className="mt-2">
              {history.map((item) => (
                <li key={item.url} className="border-b border-ink/10">
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
                    onClick={() => {
                      setRaw(item.url);
                      setMedia(null);
                      setResolvedFor("");
                      setError("");
                      setPhase("idle");
                      setStep(2);
                    }}
                  >
                    <span className="w-24 shrink-0 truncate text-xs font-medium text-muted">
                      {platformLabel(item.platform)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function explainError(message: string, text: Copy): string {
  if (message.includes("empty-video")) return text.emptyVideo;
  if (message.includes("save step is busy") || message.includes("timed out") || message.includes("busy right now")) {
    return text.busy;
  }
  if (message.includes("wouldn't hand over") || message.includes("Private and login-only")) {
    return text.privatePost;
  }
  return message;
}

function explainHint(hint: string, text: Copy): string {
  return hint
    .split("+")
    .map((part) => {
      if (part === "expires") return text.hintExpires;
      if (part === "photo") return text.hintPhoto;
      if (part === "audio-fallback") return text.hintAudio;
      if (part.startsWith("quality:")) {
        const [, asked, got] = part.split(":");
        return text.hintQuality(asked ?? "", got ?? "");
      }
      return part;
    })
    .filter(Boolean)
    .join(" ");
}

function localizeDetail(detail: string, text: Copy): string {
  if (detail === "H.264 · full sound") return text.detailSound;
  if (detail === "Original file" || detail === "Original") return text.detailOriginal;
  if (detail === "Sound only") return text.detailAudio;
  return detail;
}

function WatchStage({
  label,
  title,
  pageUrl,
  file,
  poster,
}: {
  label: string;
  title: string;
  pageUrl: string;
  file?: MediaFile;
  poster?: string;
}) {
  const id = youtubeId(pageUrl);
  if (!id && file?.kind !== "video") return null;
  return (
    <figure className="preview-stage fade-in mt-5">
      <figcaption className="flex items-center gap-2 px-4 pt-3 text-xs font-medium tracking-wide text-surface/80">
        <span className="size-1.5 rounded-full bg-accent" />
        {label}
      </figcaption>
      {id ? (
        <iframe
          className="preview-frame"
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : file?.kind === "video" ? (
        <div className="preview-fit">
          <video
            key={file.url}
            className="watch"
            controls
            playsInline
            preload="metadata"
            poster={poster}
            src={file.url}
          />
        </div>
      ) : poster ? (
        <div className="preview-fit">
          <img src={poster} alt="" className="watch object-contain" />
        </div>
      ) : null}
    </figure>
  );
}

function Alert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="fade-in mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm leading-relaxed text-ink" role="alert">
      {message}
    </p>
  );
}

function GroupCard({
  index,
  filesLabel,
  files,
  poster,
  showPlayer,
  selectedId,
  onSelect,
  savingId,
  progress,
  copy,
  onSave,
}: {
  index: number;
  filesLabel: string;
  files: MediaFile[];
  poster?: string;
  showPlayer: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  savingId: string | null;
  progress: number | null;
  copy: Copy;
  onSave: (file: MediaFile) => void;
}) {
  const selected = files.find((item) => item.id === selectedId) ?? files[0];
  if (!selected) return null;
  const showVideo = showPlayer && selected.preview && selected.kind === "video";
  const showImage = selected.kind === "image";
  const busy = savingId === selected.id;
  const action = selected.kind === "audio" ? copy.saveAudio : selected.kind === "image" ? copy.saveImage : copy.saveVideo;

  return (
    <article>
      {index > 0 ? (
        <p className="mb-2 text-xs font-medium tracking-wide text-muted">
          {filesLabel} {index}
        </p>
      ) : null}
      {showVideo ? (
        <div className="flex justify-center overflow-hidden rounded-[1.25rem] bg-ink">
          <video
            key={selected.url}
            className="watch fade-in rounded-2xl"
            controls
            playsInline
            preload="metadata"
            poster={poster}
            src={selected.url}
          />
        </div>
      ) : null}
      {showImage ? (
        <img src={selected.url} alt="" className="max-h-96 w-full rounded-2xl bg-bg object-contain" />
      ) : null}
      {showPlayer && !showVideo && !showImage && poster ? (
        <div className="flex justify-center overflow-hidden rounded-[1.25rem] bg-ink">
          <img src={poster} alt="" className="watch fade-in rounded-2xl object-contain" />
        </div>
      ) : null}
      {files.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={filesLabel}>
          {files.map((item) => {
            const on = item.id === selected.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(item.id)}
                className={"press h-11 rounded-full px-3 text-sm font-medium " + (on ? "bg-ink text-surface" : "bg-bg text-ink")}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">
          {selected.label}
          {selected.detail ? ` · ${localizeDetail(selected.detail, copy)}` : ""}
          {selected.bytes ? ` · ~${formatBytes(selected.bytes)}` : ""}
        </p>
        <p className="truncate text-xs text-muted">{selected.filename}</p>
        <span className="orbit">
          <button
            type="button"
            onClick={() => onSave(selected)}
            disabled={busy}
            className="orbit-btn press inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-medium disabled:opacity-60"
          >
            <Download className="size-4" aria-hidden />
            {busy ? (progress && progress > 0 ? `${copy.saving} ${Math.round(progress * 100)}%` : copy.saving) : action}
          </button>
        </span>
      </div>
    </article>
  );
}

function Mark() {
  return (
    <span className="relative grid h-11 w-9 shrink-0 place-items-center rounded-lg bg-ink" aria-hidden>
      <span className="absolute inset-x-1.5 top-1.5 h-1 rounded-full bg-accent" />
      <span className="size-2.5 rounded-full border-2 border-surface" />
      <span className="absolute inset-x-1.5 bottom-1.5 h-1 rounded-full bg-surface/50" />
    </span>
  );
}

function Sprockets() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      <span className="hole size-1.5 rounded-full bg-accent-ink" />
      <span className="hole size-1.5 rounded-full bg-accent-ink" />
      <span className="hole size-1.5 rounded-full bg-accent-ink" />
    </span>
  );
}
