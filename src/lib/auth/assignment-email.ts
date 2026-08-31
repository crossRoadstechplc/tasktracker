import { getAdminPortalUrl } from "@/src/lib/auth/mail";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAssignmentEmailContent(input: {
  firstName: string;
  email: string;
  title: string;
  body: string;
  link: string;
  actorName?: string;
}): { subject: string; text: string; html: string } {
  const greetingName = input.firstName.trim() || "there";
  const actorLine = input.actorName?.trim() || "A teammate";
  const subject = input.title;
  const portalUrl = getAdminPortalUrl();

  const text = [
    `Hi ${greetingName},`,
    "",
    input.body,
    "",
    `Open Task Tracker: ${input.link}`,
    `Login page: ${portalUrl}/login`,
    "",
    `Thanks,`,
    actorLine,
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
                <p style="margin:0;color:#555555;font-size:14px;">${escapeHtml(input.title)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0 28px;">
                <p style="margin:0 0 12px 0;font-size:15px;">Hi ${escapeHtml(greetingName)},</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;">${escapeHtml(input.body)}</p>
                <p style="margin:0 0 18px 0;">
                  <a href="${escapeHtml(input.link)}"
                     style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:bold;">
                    View in Task Tracker
                  </a>
                </p>
                <p style="margin:0 0 8px 0;font-size:13px;color:#555555;word-break:break-all;">
                  Or paste this link into your browser:<br />
                  <a href="${escapeHtml(input.link)}" style="color:#0b5fff;">${escapeHtml(input.link)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px 28px;font-size:13px;color:#555555;">
                Thanks,<br />${escapeHtml(actorLine)}
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
