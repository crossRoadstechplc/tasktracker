import { createHash, randomBytes } from "node:crypto";
import { getAdminPortalUrl, getInviteTtlHours } from "@/src/lib/auth/mail";

export function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiresAtFromNow(ttlHours = getInviteTtlHours()): Date {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);
  return expiresAt;
}

export function getAcceptInviteUrl(token: string): string {
  return `${getAdminPortalUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
}

export function buildInviteEmailContent(input: {
  firstName: string;
  email: string;
  acceptUrl: string;
  loginUrl: string;
  adminName?: string;
  ttlHours: number;
}): { subject: string; text: string; html: string } {
  const greetingName = input.firstName.trim() || "there";
  const adminLine = input.adminName?.trim() || "your admin";
  const subject = "You're invited to Company Task Tracker";

  const text = [
    `Hi ${greetingName},`,
    "",
    `${adminLine} invited you to Company Task Tracker.`,
    "",
    "Invite requirements:",
    "1. Open the secure invite link below.",
    "2. Create your own password (at least 8 characters).",
    "3. Sign in with your email and new password.",
    "",
    `Accept invite: ${input.acceptUrl}`,
    `Email: ${input.email}`,
    `Login page: ${input.loginUrl}`,
    "",
    `This invite expires in ${input.ttlHours} hours.`,
    "Do not share this link. If you did not expect this invite, ignore this email.",
    "",
    `Thanks,`,
    adminLine,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <h1 style="margin:0 0 8px 0;font-size:20px;line-height:1.3;">Company Task Tracker</h1>
                <p style="margin:0;color:#555555;font-size:14px;">Workforce invite</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0 28px;">
                <p style="margin:0 0 12px 0;font-size:15px;">Hi ${escapeHtml(greetingName)},</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">
                  <strong>${escapeHtml(adminLine)}</strong> invited you to join Company Task Tracker.
                </p>
                <p style="margin:0 0 8px 0;font-size:15px;font-weight:bold;">Invite requirements</p>
                <ol style="margin:0 0 20px 20px;padding:0;font-size:14px;line-height:1.6;color:#333333;">
                  <li>Open the secure invite link below.</li>
                  <li>Create your own password (at least 8 characters).</li>
                  <li>Sign in with your email and new password.</li>
                </ol>
                <p style="margin:0 0 18px 0;">
                  <a href="${escapeHtml(input.acceptUrl)}"
                     style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:bold;">
                    Accept invite &amp; set password
                  </a>
                </p>
                <p style="margin:0 0 8px 0;font-size:13px;color:#555555;word-break:break-all;">
                  Or paste this link into your browser:<br />
                  <a href="${escapeHtml(input.acceptUrl)}" style="color:#0b5fff;">${escapeHtml(input.acceptUrl)}</a>
                </p>
                <p style="margin:16px 0 0 0;font-size:13px;color:#555555;line-height:1.5;">
                  Email: <strong>${escapeHtml(input.email)}</strong><br />
                  Login page: ${escapeHtml(input.loginUrl)}<br />
                  Expires in <strong>${input.ttlHours} hours</strong>.
                </p>
                <p style="margin:16px 0 0 0;font-size:12px;color:#777777;line-height:1.5;">
                  Do not share this link. If you did not expect this invite, you can ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px 28px;font-size:13px;color:#555555;">
                Thanks,<br />${escapeHtml(adminLine)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
