"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Upload, X } from "./icons";
import { cn } from "./cn";
import { primaryFill } from "./styles";

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
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  label: string;
  hint?: string;
  aspect?: string;
  optional?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const small = await downscale(blob);
      const form = new FormData();
      form.append("file", small, "photo.jpg");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
      setPreview(data.url);
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

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
  }

  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all disabled:opacity-50";

  return (
    <div>
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-600">
        {label}{" "}
        {optional && <span className="text-neutral-400">(optional)</span>}
      </span>

      {preview ? (
        <div className={cn("relative w-full overflow-hidden rounded-xl", aspect)}>
          <Image
            src={preview}
            alt=""
            fill
            sizes="360px"
            className="object-cover"
          />
          <button
            type="button"
            onClick={clear}
            aria-label="Remove photo"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-neutral-900/70 text-white backdrop-blur transition hover:bg-neutral-900"
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
            <span className="text-[13px] text-neutral-600">Uploading…</span>
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
                  "bg-white text-neutral-900 shadow-[inset_0_0_0_2px_rgba(51,52,44,0.12)] hover:-translate-y-0.5"
                )}
              >
                <Upload /> Upload
              </button>
            </div>
          )}
        </div>
      )}

      {hint && !error && (
        <p className="mt-1.5 text-[12px] text-neutral-600">{hint}</p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-failed-600">{error}</p>}

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
        <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-lift">
            <div className="relative aspect-[3/4] bg-neutral-900">
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
                className={cn(btn, "text-neutral-600 hover:bg-neutral-100")}
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
