import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { AcceptOrgAdminForm } from "@/components/AcceptOrgAdminForm";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/orgAdminInvite";

export const dynamic = "force-dynamic";

// Redeem an org-admin invite link. The raw token rides in the path; we look it
// up by hash. A used, revoked, or unknown link all show the same calm dead-end.
export default async function AdminInvitePage(
  props: {
    params: Promise<{ token: string }>;
  }
) {
  const params = await props.params;
  const invite = await prisma.orgAdminInvite.findUnique({
    where: { tokenHash: hashToken(params.token) },
    select: {
      email: true,
      status: true,
      organization: { select: { name: true } },
    },
  });

  if (!invite || invite.status !== "pending") {
    return (
      <AuthShell>
        <h1 className="text-[24px] font-semibold text-neutral-900">
          This invite link is no longer valid
        </h1>
        <p className="mt-2 text-[16px] text-neutral-700">
          It may have already been used or been revoked. Ask a master admin to
          send you a new one.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block font-semibold text-rescued-600 hover:underline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-[24px] font-semibold text-neutral-900">
        Create your org-admin account
      </h1>
      <p className="mt-2 text-[16px] text-neutral-700">
        You&apos;ll administer{" "}
        <span className="font-semibold text-neutral-900">
          {invite.organization.name}
        </span>
        .
      </p>
      <div className="mt-6">
        <AcceptOrgAdminForm token={params.token} suggestedEmail={invite.email} />
      </div>
    </AuthShell>
  );
}
