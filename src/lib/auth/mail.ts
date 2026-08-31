import nodemailer from "nodemailer";

export function getInviteTtlHours(): number {
  const raw = process.env.INVITE_TTL_HOURS;
  const parsed = raw ? Number.parseInt(raw, 10) : 72;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 72;
}

export function getAdminPortalUrl(): string {
  const fromEnv = process.env.ADMIN_PORTAL_URL?.trim().replace(/\/$/, "");
  return fromEnv || "http://localhost:3000";
}

export function getLoginUrl(): string {
  return `${getAdminPortalUrl()}/login`;
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    user;

  if (!host || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port: Number.isFinite(port) ? port : 465,
    user,
    pass,
    from,
  };
}

export function isSmtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

export async function sendInviteEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  await sendNotificationEmail(input);
}

export async function sendNotificationEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in .env.",
    );
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
