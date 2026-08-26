import type { PermissionRole } from "@/src/generated/prisma/client";
import type { PermissionRoleLabel, TaskStatusLabel } from "@/src/types/workspace";

export const DEFAULT_WORKSPACE_SLUG = "default";

export const PERMISSION_ROLE_LABELS: PermissionRoleLabel[] = [
  "Super Admin",
  "Admin",
  "Lead",
  "Senior Staff",
  "Junior Staff",
];

export const PERMISSION_ROLE_TO_DB: Record<PermissionRoleLabel, PermissionRole> = {
  "Super Admin": "SUPER_ADMIN",
  Admin: "ADMIN",
  Lead: "LEAD",
  "Senior Staff": "SENIOR_STAFF",
  "Junior Staff": "JUNIOR_STAFF",
};

export const PERMISSION_ROLE_FROM_DB: Record<PermissionRole, PermissionRoleLabel> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  LEAD: "Lead",
  SENIOR_STAFF: "Senior Staff",
  JUNIOR_STAFF: "Junior Staff",
};

export const TASK_STATUS_TO_DB: Record<TaskStatusLabel, "TO_DO" | "IN_PROGRESS" | "DONE"> = {
  "To Do": "TO_DO",
  "In Progress": "IN_PROGRESS",
  Done: "DONE",
};

export const TASK_STATUS_FROM_DB: Record<"TO_DO" | "IN_PROGRESS" | "DONE", TaskStatusLabel> = {
  TO_DO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

export function toPermissionRoleLabel(value: string): PermissionRoleLabel {
  if (PERMISSION_ROLE_LABELS.includes(value as PermissionRoleLabel)) {
    return value as PermissionRoleLabel;
  }
  return "Junior Staff";
}

export function toTaskStatusLabel(value: string): TaskStatusLabel {
  if (value === "Backlog") return "To Do";
  if (value === "To Do" || value === "In Progress" || value === "Done") {
    return value;
  }
  return "To Do";
}
