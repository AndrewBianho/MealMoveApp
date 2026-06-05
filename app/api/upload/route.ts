import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadImage } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — client downscales before sending

// Accepts a single image (multipart form field "file"), stores it in Supabase
// Storage, and returns its public URL. Restaurants/org admins upload listing
// photos; volunteers upload pickup/delivery proof photos. The bare URL is
// harmless until a server action attaches it to a record the caller owns.
const ALLOWED_ROLES = ["restaurant", "org_admin", "volunteer"];

export async function POST(req: Request) {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "That isn't an image." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (5 MB max)." },
      { status: 413 }
    );
  }

  try {
    const url = await uploadImage(file);
    return NextResponse.json({ url });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Upload failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
