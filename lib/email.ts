import "server-only";

// Transactional email via SMTP — used for password-reset links. Follows the
// "integration seam" pattern of lib/notify.ts: when SMTP env vars are set, send
// for real via nodemailer; otherwise log the link to the server console so the
// whole reset flow works end-to-end in dev with zero spend (free Gmail app
// password or campus SMTP slots in by setting SMTP_* in Code/.env).
//
// nodemailer is imported lazily so an unconfigured deploy never pays to load it,
// and a missing dependency can't break the build path that doesn't send mail.

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;

function smtpConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_FROM);
}

// Encodes the three characters that break out of an HTML text node. Safe for
// text content (the only use here, building email bodies); NOT sufficient for
// attribute values, which would also need quote escaping.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function absoluteUrl(path: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  // Without APP_URL the result is only root-relative, which produces dead links
  // in emails (they open in no browser context). Warn so the misconfiguration is
  // visible at send time rather than when a recipient clicks a broken link.
  if (!base) {
    console.warn("[email] APP_URL is not set — email links will be relative and may not work.");
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// Send one opt-in nudge email. Mirrors sendPasswordResetEmail: lazy nodemailer,
// never throws, logs in dev when SMTP is unconfigured.
export async function sendNudgeEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!smtpConfigured()) {
    console.log(`[nudge] would email ${to}: ${subject}`);
    return;
  }
  try {
    const nodemailer = await import("nodemailer");
    const port = Number(SMTP_PORT);
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from: SMTP_FROM, to, subject, html });
  } catch (e) {
    console.error("[nudge] email send failed:", e);
  }
}

/**
 * Send the password-reset email. Never throws — a mail outage must not surface
 * to the caller, because that would leak whether an account exists.
 */
export async function sendPasswordResetEmail(
  to: string,
  link: string
): Promise<void> {
  if (!smtpConfigured()) {
    // Dev seam: no SMTP configured, so print the link instead of sending.
    console.log(`[password-reset] would email ${to}: ${link}`);
    return;
  }

  try {
    const nodemailer = await import("nodemailer");
    const port = Number(SMTP_PORT);
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject: "Reset your Meal Move password",
      text:
        `Someone asked to reset the password for this Meal Move account.\n\n` +
        `Reset it here (the link expires in 1 hour):\n${link}\n\n` +
        `If this wasn't you, you can safely ignore this email.`,
      html:
        `<p>Someone asked to reset the password for this Meal Move account.</p>` +
        `<p><a href="${link}">Reset your password</a> — the link expires in 1 hour.</p>` +
        `<p>If this wasn't you, you can safely ignore this email.</p>`,
    });
  } catch (e) {
    // Swallow: keep the response identical whether or not mail went out.
    console.error("[password-reset] email send failed:", e);
  }
}
