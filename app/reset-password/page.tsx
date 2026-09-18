import { ResetPasswordForm } from "@/components/ResetPasswordForm";

// The reset token rides in the query string, so this page must never enter a
// search index — robots.txt only asks crawlers not to fetch it, while this
// keeps it out of results even if someone links the URL.
export const metadata = { robots: { index: false, follow: false } };

export default async function ResetPasswordPage(
  props: {
    searchParams: Promise<{ token?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
