import type { WorkspaceData } from "@/src/types/workspace";

const PERMISSION_ROLES = [
  "Super Admin",
  "Admin",
  "Lead",
  "Senior Staff",
  "Junior Staff",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

const isStringArrayRecord = (value: unknown): value is Record<string, string[]> =>
  isRecord(value) && Object.values(value).every(isStringArray);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((item) => typeof item === "string");

const isValidScheduleEvent = (event: unknown): boolean => {
  if (!isRecord(event)) return false;
  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.start === "string" &&
    typeof event.end === "string"
  );
};

const isValidSchedule = (value: unknown): boolean =>
  isRecord(value) &&
  Array.isArray(value.events) &&
  value.events.every(isValidScheduleEvent);

const isValidPermissionMatrix = (value: unknown): boolean =>
  isRecord(value) &&
  PERMISSION_ROLES.every(
    (role) =>
      isRecord(value[role]) &&
      Object.values(value[role]).every((allowed) => typeof allowed === "boolean"),
  );

export function validateWorkspaceData(data: unknown): string {
  if (!isRecord(data)) return "Workspace payload must be an object.";

  const checks: [boolean, string][] = [
    [isRecordArray(data.tasks), "tasks"],
    [isStringArray(data.teams), "projects"],
    [isRecordArray(data.deletedTasks), "deleted tasks"],
    [data.archivedTasks === undefined || isRecordArray(data.archivedTasks), "archived tasks"],
    [isStringArray(data.staff), "team members"],
    [
      isRecord(data.staffProfiles) &&
        Object.values(data.staffProfiles).every(isRecord),
      "team member profiles",
    ],
    [isStringArrayRecord(data.teamMembers), "project memberships"],
    [isStringRecord(data.teamLeaders), "project leaders"],
    [isStringArray(data.orgTeams), "teams"],
    [isStringArrayRecord(data.orgTeamMembers), "team memberships"],
    [data.schedule === undefined || isValidSchedule(data.schedule), "schedule"],
    [
      data.permissionMatrix === undefined || isValidPermissionMatrix(data.permissionMatrix),
      "permissions",
    ],
  ];

  const invalid = checks.find(([isValid]) => !isValid);
  return invalid ? `The payload contains invalid ${invalid[1]} data.` : "";
}

export function assertWorkspaceData(data: unknown): asserts data is WorkspaceData {
  const error = validateWorkspaceData(data);
  if (error) {
    throw new Error(error);
  }
}
