import Link from "next/link";
import { RequestResetForm } from "@/components/RequestResetForm";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-[32px] font-medium leading-tight">Reset password</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600">
        Enter your email and we&apos;ll send a link to set a new password.
      </p>

      <RequestResetForm />

      <p className="mt-6 text-sm text-neutral-600">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-rescued-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
