import { AuthShell } from "@/components/AuthShell";
import { RequestResetForm } from "@/components/RequestResetForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <RequestResetForm />
    </AuthShell>
  );
}
