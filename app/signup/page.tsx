import Link from "next/link";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-[32px] font-medium leading-tight">Create account</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-600">
        Join your campus food-rescue chapter.
      </p>

      <SignupForm />

      <p className="mt-6 text-sm text-neutral-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-rescued-600 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
