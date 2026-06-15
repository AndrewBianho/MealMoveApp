import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">New password</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-700">
        Choose a new password for your Meal Move account.
      </p>

      <ResetPasswordForm token={token} />
    </main>
  );
}
