export function buildInviteMessage(input: {
  firstName: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  adminName?: string;
  ttlHours?: number;
}): string {
  const greetingName = input.firstName.trim() || "there";
  const fromLine = input.adminName?.trim()
    ? `\nThanks,\n${input.adminName.trim()}`
    : "\nThanks";
  const ttlHours = input.ttlHours && input.ttlHours > 0 ? input.ttlHours : 72;

  return [
    `Hi ${greetingName},`,
    "",
    "You've been invited to Company Task Tracker.",
    "",
    `Login: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.tempPassword}`,
    "",
    "For security, you must change this password on first login.",
    `This invite expires in ${ttlHours} hours.`,
    fromLine,
  ].join("\n");
}
