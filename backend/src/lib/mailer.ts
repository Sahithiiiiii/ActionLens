import nodemailer, { type Transporter } from "nodemailer";

/**
 * Sends email over SMTP (Gmail by default). Works with any SMTP server by changing
 * SMTP_HOST / SMTP_PORT / SMTP_SECURE.
 *
 * Gmail setup: turn on 2-Step Verification, create an App Password at
 * https://myaccount.google.com/apppasswords and put it in SMTP_PASS.
 */
export interface Message {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const env = (name: string) => process.env[name]?.trim() || "";

function settings() {
  const port = Number(env("SMTP_PORT")) || 465;
  return {
    host: env("SMTP_HOST") || "smtp.gmail.com",
    port,
    // 465 = implicit TLS (secure: true). 587 = STARTTLS (secure: false).
    secure: env("SMTP_SECURE") ? env("SMTP_SECURE") === "true" : port === 465,
    user: env("SMTP_USER"),
    // Google shows app passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it.
    pass: env("SMTP_PASS").replace(/\s+/g, ""),
  };
}

/** "From" must match the Gmail account (Gmail rewrites it otherwise). */
const fromHeader = () => env("EMAIL_FROM") || `ActionLens <${settings().user}>`;

/** Fail fast at worker start-up instead of on the first email. */
export function assertEmailConfig() {
  const s = settings();
  if (!s.user || !s.pass) {
    throw new Error(
      "SMTP_USER and SMTP_PASS are missing from .env (for Gmail, SMTP_PASS must be an App Password)",
    );
  }
  return "smtp";
}

let transporter: Transporter | undefined;
function getTransporter() {
  if (!transporter) {
    const s = settings();
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: { user: s.user, pass: s.pass },
      pool: true, // reuse connections instead of logging in for every email
      maxConnections: 3,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return transporter;
}

/** Logs a clear message at start-up if the SMTP login doesn't work. Never throws. */
export async function verifyEmailTransport() {
  const s = settings();
  try {
    await getTransporter().verify();
    console.log(`SMTP ready: ${s.user} via ${s.host}:${s.port}`);
  } catch (error) {
    const e = error as { code?: string; responseCode?: number; message?: string };
    const authFailed = e.code === "EAUTH" || e.responseCode === 535;
    console.error(
      authFailed
        ? "SMTP login rejected. For Gmail, use an App Password (needs 2-Step Verification), not your normal password, and put your full address in SMTP_USER."
        : `Could not reach the SMTP server (${s.host}:${s.port}): ${e.message ?? error}`,
    );
  }
}

/** Returns the message id. Throws on failure (so BullMQ retries). */
export async function sendEmail(m: Message): Promise<string> {
  const info = await getTransporter().sendMail({
    from: fromHeader(),
    to: m.to,
    subject: m.subject,
    text: m.text,
    ...(m.html ? { html: m.html } : {}),
  });
  if (!info.messageId) throw new Error("SMTP server returned no message ID");
  if (info.rejected?.length) throw new Error(`Recipient rejected: ${info.rejected.join(", ")}`);
  return info.messageId;
}
