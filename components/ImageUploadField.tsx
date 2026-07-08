"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Upload, X } from "./icons";
import { cn } from "./cn";
import { primaryFill } from "./styles";
import {
  clearPendingUpload,
  getPendingUpload,
  savePendingUpload,
  shouldQueueUpload,
} from "@/lib/uploadQueue";

// Downscale to keep phone photos small (fast uploads, well under the 5 MB cap)
// and re-encode as JPEG. Works on both a File (upload) and a canvas blob (camera).
async function downscale(source: Blob, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process image."))),
      "image/jpeg",
      0.85
    )
  );
}

export function ImageUploadField({
  value,
  onChange,
  label,
  hint,
  aspect = "aspect-[16/9]",
  optional = true,
  uploadKey,
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  label: string;
  hint?: string;
  aspect?: string;
  optional?: boolean;
  /**
   * Stable id (e.g. "pickup:<listingId>"). When set, a photo captured while
   * offline is stashed locally and uploaded automatically on reconnect, so the
   * pickup isn't lost on a flaky connection.
   */
  uploadKey?: string;
}) {
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const nativeCamInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Open/close the live camera stream alongside the modal.
  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        // No camera / permission denied → fall back to the device camera app.
        if (!cancelled) {
          setCameraOpen(false);
          setError(null);
          nativeCamInput.current?.click();
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);

  // Downscale + POST, returning the hosted URL or throwing. A network failure
  // throws (so callers can decide to queue); a server error throws its message.
  async function postUpload(blob: Blob): Promise<string> {
    const small = await downscale(blob);
    const form = new FormData();
    form.append("file", small, "photo.jpg");
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
    return data.url;
  }

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    setQueued(false);
    try {
      const url = await postUpload(blob);
      setPreview(url);
      onChange(url);
    } catch (e) {
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      // Offline (or a network hiccup): stash the photo and finish on reconnect
      // instead of losing it. Needs a uploadKey to know what to resume.
      if (uploadKey && shouldQueueUpload(online, e)) {
        await savePendingUpload(uploadKey, blob);
        setPreview(URL.createObjectURL(blob));
        setQueued(true);
      } else {
        setError(e instanceof Error ? e.message : "Upload failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  // Try to send a previously-stashed photo. Clears the queue + advances the
  // claim (onChange) on success; stays queued if still offline.
  const flush = useCallback(async () => {
    if (!uploadKey) return;
    const blob = await getPendingUpload(uploadKey);
    if (!blob) return;
    setBusy(true);
    try {
      const url = await postUpload(blob);
      await clearPendingUpload(uploadKey);
      setQueued(false);
      setPreview(url);
      onChange(url);
    } catch {
      // Still unreachable — leave it queued for the next reconnect.
    } finally {
      setBusy(false);
    }
    // postUpload/onChange are stable enough for this manual resume path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadKey]);

  // On mount, pick up any photo stashed in a previous (offline) session, and
  // flush automatically whenever the connection returns.
  useEffect(() => {
    if (!uploadKey) return;
    let cancelled = false;
    (async () => {
      const blob = await getPendingUpload(uploadKey);
      if (blob && !cancelled) {
        setQueued(true);
        setPreview((p) => p ?? URL.createObjectURL(blob));
        if (typeof navigator === "undefined" || navigator.onLine) flush();
      }
    })();
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [uploadKey, flush]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setCameraOpen(false);
    canvas.toBlob((b) => b && upload(b), "image/jpeg", 0.9);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (file) upload(file);
  }

  function clear() {
    setPreview(null);
    onChange(null);
    setError(null);
    setQueued(false);
    if (uploadKey) clearPendingUpload(uploadKey);
  }

  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[15px] font-semibold transition-all disabled:opacity-50";

  return (
    <div>
      <span className="mb-1.5 block font-mono text-[13px] text-neutral-700">
        {label}{" "}
        {optional && <span className="text-neutral-700">(optional)</span>}
      </span>

      {preview ? (
        <div className={cn("relative w-full overflow-hidden rounded-xl", aspect)}>
          <Image
            src={preview}
            alt="Photo preview"
            fill
            sizes="360px"
            className="object-cover"
          />
          <button
            type="button"
            onClick={clear}
            aria-label="Remove photo"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
          >
            <X />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "grid w-full place-items-center rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/60",
            aspect
          )}
        >
          {busy ? (
            <span className="text-[15px] text-neutral-700">Uploading…</span>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setCameraOpen(true);
                }}
                className={cn(btn, primaryFill, "hover:-translate-y-0.5")}
              >
                <Camera /> Take photo
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className={cn(
                  btn,
                  "bg-card text-neutral-900 shadow-[inset_0_0_0_2px_rgb(var(--n-900)_/_0.14)] hover:-translate-y-0.5"
                )}
              >
                <Upload /> Upload
              </button>
            </div>
          )}
        </div>
      )}

      {hint && !error && !queued && (
        <p className="mt-1.5 text-[14px] text-neutral-700">{hint}</p>
      )}
      {error && <p className="mt-1.5 text-[14px] text-failed-600">{error}</p>}
      {queued && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-urgent-700">
          <span aria-hidden="true">⏳</span>
          Saved — we&apos;ll upload it when you&apos;re back online. Your pickup is
          safe.
        </p>
      )}

      {/* Hidden inputs: gallery/file picker, and the device's native camera. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={onPick}
      />
      <input
        ref={nativeCamInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPick}
      />

      {/* In-app camera modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-modal grid animate-fade-in place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-scale-in overflow-hidden rounded-3xl bg-card shadow-lift">
            <div className="relative aspect-[3/4] bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <button
                type="button"
                onClick={() => setCameraOpen(false)}
                className={cn(btn, "text-neutral-700 hover:bg-neutral-100")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={capture}
                className={cn(btn, primaryFill, "px-5")}
              >
                <Camera /> Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
