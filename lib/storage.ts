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

/** Upload an image file and return its public URL. */
export async function uploadImage(file: File): Promise<string> {
  await ensureBucket();
  const supabase = getClient();
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}
