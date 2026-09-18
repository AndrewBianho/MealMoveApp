import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client for image uploads. Uses the service-role key, so
// it must never be imported into client code (the "server-only" guard enforces
// this at build time). Reuses the existing Supabase project — no new vendor.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "food-images";

let client: ReturnType<typeof createClient> | null = null;
let bucketReady = false;

function getClient() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "Image upload is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Code/.env."
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

// Create the public bucket on first use so there's nothing to click in the
// dashboard. Cheap and idempotent — we cache success for the process lifetime.
async function ensureBucket() {
  if (bucketReady) return;
  const supabase = getClient();
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "5MB",
    });
  }
  bucketReady = true;
}

// The raster formats a phone camera or a photo upload can actually produce,
// identified by their leading bytes. The browser-supplied `file.type` is not
// evidence of anything — it is just a string the caller chose — so the stored
// object's type is decided here, from the bytes themselves.
//
// This is what keeps `image/svg+xml` out of the bucket. SVG passes an
// `image/*` check, but it is a document: it can carry <script>, and the bucket
// is public, so storing one would serve attacker-controlled script from our
// own Supabase origin. No magic number matches SVG, so it is refused here
// along with anything else that isn't one of these four.
const SIGNATURES: { type: string; ext: string; match: (b: Buffer) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    ext: "png",
    match: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: "image/webp",
    ext: "webp",
    match: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  {
    type: "image/gif",
    ext: "gif",
    match: (b) => b.subarray(0, 6).toString("latin1") === "GIF87a" ||
      b.subarray(0, 6).toString("latin1") === "GIF89a",
  },
];

/** The real image type of these bytes, or null if they aren't a known image. */
export function sniffImageType(bytes: Buffer): { type: string; ext: string } | null {
  if (bytes.length < 12) return null;
  const hit = SIGNATURES.find((s) => s.match(bytes));
  return hit ? { type: hit.type, ext: hit.ext } : null;
}

/**
 * Upload an image file and return its public URL.
 *
 * Throws when the bytes aren't a recognized raster image — the caller's
 * declared MIME type is never trusted, since the bucket is public and serves
 * whatever content type it is handed.
 */
export async function uploadImage(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniffImageType(bytes);
  if (!kind) {
    throw new Error("That file isn't a supported image (JPEG, PNG, WebP, or GIF).");
  }

  await ensureBucket();
  const supabase = getClient();
  const path = `${crypto.randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: kind.type,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}
