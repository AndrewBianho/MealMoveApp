import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
