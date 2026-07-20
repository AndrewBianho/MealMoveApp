import type { Metadata } from "next";
import Link from "next/link";
import { DonorProtectionNote } from "@/components/DonorProtectionNote";

// Public privacy policy (allow-listed in auth.config so it's reachable before
// sign-up). It describes the data Meal Move actually handles today, plus push
// notifications, which are opt-in and rolling out.
//
// BEFORE LAUNCH, replace the org-specific placeholders below:
//   • CONTACT_EMAIL — a real inbox the chapter monitors
//   • ORG_NAME / governing org + jurisdiction, if your campus or chapter needs it
//   • EFFECTIVE_DATE — keep current whenever the policy changes
// This is a plain-language starting point, not legal advice. Have someone
// qualified review it against the laws that apply to your chapter (for example
// GDPR or CCPA) before you rely on it.

const ORG_NAME = "Meal Move";
const CONTACT_EMAIL = "support@mealmove.org";
const EFFECTIVE_DATE = "June 16, 2026";

export const metadata: Metadata = {
  title: "Privacy policy — Meal Move",
  description:
    "How Meal Move collects, uses, and protects your information.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-neutral-800">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[72ch] px-6 py-12">
      <p className="font-mono text-xs text-neutral-700">
        last updated {EFFECTIVE_DATE}
      </p>
      <h1 className="mt-2 text-[40px] font-semibold leading-[1.1] tracking-tight text-balance">
        Privacy policy
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-neutral-800">
        {ORG_NAME} helps campus volunteers rescue surplus restaurant food and
        deliver it to drop-off locations. This policy explains what information
        we collect, why we collect it, and the choices you have. We keep it
        plain and short, the same way we try to keep the app.
      </p>

      <Section title="Information we collect">
        <p>We collect only what we need to move food reliably:</p>
        <ul className="ml-5 list-disc space-y-2 marker:text-clay-600">
          <li>
            <strong className="font-semibold">Account details.</strong> Your
            name, email address, phone number, role (volunteer, restaurant,
            drop-off, or organizer), and a securely hashed password. Restaurants
            and drop-offs also provide a location address.
          </li>
          <li>
            <strong className="font-semibold">Activity.</strong> The pickups you
            post, claim, and deliver, timestamps for each step, and the
            coordination messages you send other participants on a rescue.
          </li>
          <li>
            <strong className="font-semibold">Reliability.</strong> A
            non-punitive record of completed and missed pickups, shown only as
            calm bars and percentages, never as grades or public callouts.
          </li>
          <li>
            <strong className="font-semibold">Photos.</strong> Pickup and
            delivery photos you choose to capture, used as proof that food
            changed hands.
          </li>
          <li>
            <strong className="font-semibold">Location.</strong> See the
            location section below.
          </li>
          <li>
            <strong className="font-semibold">Technical data.</strong> Your IP
            address and basic request details, used to keep accounts secure and
            to limit abuse (for example, throttling repeated failed logins).
          </li>
          <li>
            <strong className="font-semibold">Notification tokens.</strong> If
            you turn on push notifications, we store the device token your
            browser provides so we can send the notifications you asked for.
          </li>
        </ul>
      </Section>

      <Section title="Location data">
        <p>
          When you view the map or the listings feed, your browser may ask for
          permission to share your location. We use it on your device to show
          how far each pickup is and to center the map. Sharing your location is
          optional: if you decline, the app still works, and distances simply
          show as a dash.
        </p>
        <p>
          Restaurant and drop-off addresses are converted to map coordinates
          through Mapbox so pins land in the right place.
        </p>
      </Section>

      <Section title="How we use your information">
        <ul className="ml-5 list-disc space-y-2 marker:text-clay-600">
          <li>To run the service: posting, claiming, and coordinating rescues.</li>
          <li>To show reliability so the operation stays trustworthy.</li>
          <li>
            To send the notifications you opt into, such as buddy invites and
            drop-off arrival notices.
          </li>
          <li>To keep accounts secure and prevent abuse.</li>
          <li>To support the chapter and respond to your requests.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not use it for
          advertising.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          We share data only with the service providers that help us run the
          app, and only as needed to operate it:
        </p>
        <ul className="ml-5 list-disc space-y-2 marker:text-clay-600">
          <li>
            <strong className="font-semibold">Supabase</strong> hosts our
            database and stores uploaded photos.
          </li>
          <li>
            <strong className="font-semibold">Mapbox</strong> provides maps and
            converts addresses to coordinates.
          </li>
          <li>
            <strong className="font-semibold">Vercel</strong> hosts and serves
            the application.
          </li>
          <li>
            Our <strong className="font-semibold">email provider</strong>{" "}
            delivers account email, such as password resets and notices you opt
            into.
          </li>
          <li>
            <strong className="font-semibold">Google Firebase Cloud
            Messaging</strong> delivers push notifications, where you have
            enabled them.
          </li>
        </ul>
        <p>
          We may also share information if the law requires it, or to protect
          the safety of our users and the public.
        </p>
      </Section>

      <Section title="Notifications">
        <p>
          Notifications are opt-in. You can enable or disable them in your
          settings, and you can revoke your browser&apos;s notification
          permission at any time. Some reminders may also be sent by email so
          they reach you when push is unavailable.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your information while your account is active and for as long
          as we need it to operate the service. When you ask us to delete your
          account, we remove your personal information, except where we must
          keep limited records to meet legal or safety obligations.
        </p>
      </Section>

      <Section title="Your choices">
        <ul className="ml-5 list-disc space-y-2 marker:text-clay-600">
          <li>Access or correct your information through your profile, or by contacting us.</li>
          <li>Turn location sharing and notifications on or off at any time.</li>
          <li>Ask us to delete your account and personal information.</li>
        </ul>
        <p>
          Depending on where you live, you may have additional rights over your
          data. Contact us and we will help.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We protect your account with hashed passwords, role-based access
          controls, and rate limiting, and we restrict who can read coordination
          messages to the people on a given rescue. No system is perfectly
          secure, but we work to keep your information safe.
        </p>
      </Section>

      <Section title="Food safety & good-faith donors">
        <p>
          Restaurants share surplus in good faith, and volunteers handle it with
          a short safety check at pickup. The note below summarizes how good-faith
          donors are generally protected.
        </p>
        <DonorProtectionNote className="mt-2" />
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy as the app evolves. When we make meaningful
          changes, we will update the date at the top of this page.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          Questions about your privacy or this policy? Reach us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="-mx-1 -my-2 inline-block px-1 py-2 font-medium text-clay-800 underline-offset-2 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <div className="mt-12 border-t border-neutral-900/10 pt-6">
        <Link
          href="/"
          className="-mx-1.5 -my-2 inline-flex items-center gap-1.5 rounded px-1.5 py-2 font-mono text-[11px] text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
        >
          <span aria-hidden>←</span> back to Meal Move
        </Link>
      </div>
    </main>
  );
}
