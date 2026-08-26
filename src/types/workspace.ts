export type PermissionRoleLabel =
  | "Super Admin"
  | "Admin"
  | "Lead"
  | "Senior Staff"
  | "Junior Staff";

export type TaskStatusLabel = "To Do" | "In Progress" | "Done";

export type TaskUpdate = {
  id: string;
  text: string;
  createdAt: string;
};

export type LegacyTask = {
  id: string;
  title: string;
  description?: string;
  team: string;
  owner: string;
  owners: string[];
  priority: string;
  due: string;
  status: TaskStatusLabel;
  updates: TaskUpdate[];
};

export type DeletedTask = LegacyTask & {
  trashId: string;
  previousStatus: string;
  deletedAt: string;
};

export type ArchivedTask = LegacyTask & {
  archivedId: string;
  archivedAt: string;
};

export type StaffProfile = {
  firstName: string;
  lastName: string;
  role: string;
  permissionRole: PermissionRoleLabel;
  email?: string;
  inviteStatus?: "pending" | "active";
};

export type ScheduleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description: string;
  location: string;
  project: string;
  color: string;
  guests: string[];
};

export type WorkspaceData = {
  tasks: LegacyTask[];
  teams: string[];
  deletedTasks: DeletedTask[];
  archivedTasks: ArchivedTask[];
  staff: string[];
  staffProfiles: Record<string, StaffProfile>;
  teamMembers: Record<string, string[]>;
  teamLeaders: Record<string, string>;
  orgTeams: string[];
  orgTeamMembers: Record<string, string[]>;
  schedule: { events: ScheduleEvent[] };
  permissionMatrix: Record<PermissionRoleLabel, Record<string, boolean>>;
};

export type TrackerBackup = {
  app: "company-task-tracker";
  version: 1;
  exportedAt: string;
  data: WorkspaceData;
};
