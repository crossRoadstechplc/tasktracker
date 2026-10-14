// @ts-nocheck
/** Ported from SPX TASK TRACKER/index.html — persistence wired to /api/workspace. */
import type { AuthUserResponse } from "@/src/lib/auth/types";
import type { WorkspaceData } from "@/src/types/workspace";
import { createTrackerSync } from "@/src/tracker/tracker-sync";
import { createSettingsSync } from "@/src/tracker/tracker-settings-sync";
import { createNotificationCenter } from "@/src/tracker/notification-center";

export type TrackerInitOptions = {
  preloadData?: WorkspaceData;
  authUser?: AuthUserResponse;
  workspaceRevision?: number;
};

export function initTrackerApp(options: TrackerInitOptions = {}) {
  const preloadData = options.preloadData;
  const authUser = options.authUser ?? null;
  const initialWorkspaceRevision = options.workspaceRevision ?? 0;

    const statuses = ["To Do", "In Progress", "Done"];
      const STORAGE_KEY = "company-task-tracker-v1";
      const TEAM_STORAGE_KEY = "company-task-tracker-teams-v1";
      const TRASH_STORAGE_KEY = "company-task-tracker-trash-v1";
      const ARCHIVED_STORAGE_KEY = "company-task-tracker-archived-v1";
      const STAFF_STORAGE_KEY = "company-task-tracker-staff-v1";
      const STAFF_PROFILES_STORAGE_KEY = "company-task-tracker-staff-profiles-v1";
      const TEAM_MEMBERS_STORAGE_KEY = "company-task-tracker-team-members-v1";
      const TEAM_LEADERS_STORAGE_KEY = "company-task-tracker-team-leaders-v1";
      const ORG_TEAMS_STORAGE_KEY = "company-task-tracker-org-teams-v1";
      const ORG_TEAM_MEMBERS_STORAGE_KEY = "company-task-tracker-org-team-members-v1";
      const SCHEDULE_STORAGE_KEY = "company-task-tracker-schedule-v1";
      const PERMISSION_MATRIX_STORAGE_KEY = "company-task-tracker-permission-matrix-v1";
      // Signed-in identity comes from the auth session. Never fall back to
      // another teammate stored in this browser — that would let a missing
      // session impersonate the first staff member (often Super Admin).
      const CURRENT_USER_STORAGE_KEY = "company-task-tracker-current-user-v1";
      const BACKUP_VERSION = 1;
      const BACKUP_STORAGE_KEYS = {
        tasks: STORAGE_KEY,
        teams: TEAM_STORAGE_KEY,
        deletedTasks: TRASH_STORAGE_KEY,
        archivedTasks: ARCHIVED_STORAGE_KEY,
        staff: STAFF_STORAGE_KEY,
        staffProfiles: STAFF_PROFILES_STORAGE_KEY,
        teamMembers: TEAM_MEMBERS_STORAGE_KEY,
        teamLeaders: TEAM_LEADERS_STORAGE_KEY,
        orgTeams: ORG_TEAMS_STORAGE_KEY,
        orgTeamMembers: ORG_TEAM_MEMBERS_STORAGE_KEY,
        schedule: SCHEDULE_STORAGE_KEY,
        permissionMatrix: PERMISSION_MATRIX_STORAGE_KEY
      };
      const LAST_MODIFIED_STORAGE_KEY = "taskTrackerLastModified";

      function applyPreloadedWorkspace(data) {
        if (!data) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.tasks ?? []));
        localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(data.teams ?? []));
        localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(data.deletedTasks ?? []));
        localStorage.setItem(ARCHIVED_STORAGE_KEY, JSON.stringify(data.archivedTasks ?? []));
        localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(data.staff ?? []));
        localStorage.setItem(STAFF_PROFILES_STORAGE_KEY, JSON.stringify(data.staffProfiles ?? {}));
        localStorage.setItem(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(data.teamMembers ?? {}));
        localStorage.setItem(TEAM_LEADERS_STORAGE_KEY, JSON.stringify(data.teamLeaders ?? {}));
        localStorage.setItem(ORG_TEAMS_STORAGE_KEY, JSON.stringify(data.orgTeams ?? []));
        localStorage.setItem(ORG_TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(data.orgTeamMembers ?? {}));
        localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(data.schedule ?? { events: [] }));
        localStorage.setItem(PERMISSION_MATRIX_STORAGE_KEY, JSON.stringify(data.permissionMatrix ?? {}));
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
        if (data.projectIds) projectIds = { ...data.projectIds };
        if (data.orgTeamIds) orgTeamIds = { ...data.orgTeamIds };
        if (data.staffIds) staffIds = { ...data.staffIds };
      }

      let projectIds = { ...(preloadData?.projectIds ?? {}) };
      let orgTeamIds = { ...(preloadData?.orgTeamIds ?? {}) };
      let staffIds = { ...(preloadData?.staffIds ?? {}) };

      // Shared drag state — declare early so reload/render never hits TDZ.
      const reorderState = {
        staff: { dragged: "" },
        project: { dragged: "" },
        orgTeam: { dragged: "" }
      };

      applyPreloadedWorkspace(preloadData);

      // Captured before startup saves run, so they reflect the browser's state on load.
      const hadStoredWorkspaceData = Object.values(BACKUP_STORAGE_KEYS)
        .some(key => localStorage.getItem(key) !== null);
      const storedLastModified = localStorage.getItem(LAST_MODIFIED_STORAGE_KEY) || "";
      const defaultTeams = ["Management", "Operations", "Finance", "Marketing", "Engineering", "HR"];
      const defaultStaff = ["Nebil", "Ponu", "Sara", "Hana"];

      const demoTasks = [
        {
          id: crypto.randomUUID(),
          title: "Finalize Q3 operating plan",
          team: "Management",
          owner: "Nebil",
          priority: "High",
          due: "",
          status: "In Progress"
        },
        {
          id: crypto.randomUUID(),
          title: "Vendor payment reconciliation",
          team: "Finance",
          owner: "Ponu",
          priority: "Low",
          due: "",
          status: "To Do"
        },
        {
          id: crypto.randomUUID(),
          title: "Prepare campaign content",
          team: "Marketing",
          owner: "Sara",
          priority: "Low",
          due: "",
          status: "To Do"
        },
        {
          id: crypto.randomUUID(),
          title: "Update onboarding checklist",
          team: "HR",
          owner: "Hana",
          priority: "Low",
          due: "",
          status: "Done"
        }
      ];

      function normalizeOwners(value) {
        const raw = Array.isArray(value)
          ? value
          : (typeof value === "string" && value.trim() ? [value.trim()] : []);

        return [...new Set(raw.filter(name => typeof name === "string" && name.trim()).map(name => name.trim()))];
      }

      function taskOwners(task) {
        if (!task) return [];
        if (Array.isArray(task.owners)) return normalizeOwners(task.owners);
        return normalizeOwners(task.owner);
      }

      function taskWithOwners(task, owners) {
        const normalized = normalizeOwners(owners);
        return {
          ...task,
          owners: normalized,
          owner: normalized[0] || ""
        };
      }

      function readStoredJson(key, fallback, isValid) {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;

        try {
          const parsed = JSON.parse(raw);
          if (!isValid || isValid(parsed)) return parsed;
          console.warn(`Ignoring invalid stored data for "${key}".`);
        } catch (error) {
          console.warn(`Ignoring unreadable stored data for "${key}".`, error);
        }

        return fallback;
      }

      const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
      const isRecordArray = value => Array.isArray(value) && value.every(isRecord);
      const isStringArray = value => Array.isArray(value) && value.every(item => typeof item === "string");
      const isStringArrayRecord = value =>
        isRecord(value) && Object.values(value).every(isStringArray);
      const isStringRecord = value =>
        isRecord(value) && Object.values(value).every(item => typeof item === "string");

      // ---------------------------------------------------------------------
      // Roles & permissions. The UI hides or disables actions based on the
      // signed-in user's role. Server-side routes enforce the same matrix.
      // ---------------------------------------------------------------------
      const PERMISSION_ROLES = ["Super Admin", "Admin", "Lead", "Senior Staff", "Junior Staff"];
      const DEFAULT_STAFF_PERMISSION_ROLE = "Junior Staff";

      const PERMISSION_ACTIONS = [
        { id: "tasks.create", group: "Tasks", label: "Create tasks" },
        { id: "tasks.edit", group: "Tasks", label: "Edit task details (title, priority, due date, owners)" },
        { id: "tasks.move", group: "Tasks", label: "Move tasks between statuses (drag/drop)" },
        { id: "tasks.delete", group: "Tasks", label: "Delete tasks (send to Trash)" },
        { id: "tasks.addUpdate", group: "Tasks", label: "Post task updates" },

        { id: "trash.restore", group: "Trash", label: "Restore deleted tasks" },

        { id: "projects.create", group: "Projects", label: "Create projects" },
        { id: "projects.rename", group: "Projects", label: "Rename projects" },
        { id: "projects.delete", group: "Projects", label: "Delete projects" },
        { id: "projects.manageMembers", group: "Projects", label: "Manage project membership" },

        { id: "teams.create", group: "Teams", label: "Create teams" },
        { id: "teams.rename", group: "Teams", label: "Rename teams" },
        { id: "teams.delete", group: "Teams", label: "Delete teams" },
        { id: "teams.manageMembers", group: "Teams", label: "Manage team membership" },

        { id: "staff.create", group: "Team Members", label: "Add team members (retired — Workforce sync)" },
        { id: "staff.edit", group: "Team Members", label: "Edit team member profile (retired — Workforce owned)" },
        { id: "staff.delete", group: "Team Members", label: "Remove team members (retired — Workforce owned)" },
        { id: "staff.assignRole", group: "Team Members", label: "Assign Task Operations permission role" },

        { id: "schedule.create", group: "Schedule", label: "Create schedule events" },
        { id: "schedule.edit", group: "Schedule", label: "Edit, move, or resize schedule events" },
        { id: "schedule.delete", group: "Schedule", label: "Delete schedule events" },

        { id: "backup.export", group: "Backup", label: "Export a backup file" },
        { id: "backup.import", group: "Backup", label: "Import a backup file" },

        { id: "activity.viewOngoing", group: "Activity", label: "View Ongoing activity for assigned projects (like Completed / Deleted)" },

        { id: "settings.editPermissions", group: "Settings", label: "Edit the permission matrix" }
      ];

      // Written out explicitly (not derived) so it stays easy to eyeball and
      // hand-edit. Super Admin is always fully granted — see can() below,
      // which enforces this in code regardless of what's stored here.
      const DEFAULT_PERMISSION_MATRIX = {
        "Super Admin": Object.fromEntries(PERMISSION_ACTIONS.map(a => [a.id, true])),
        "Admin": {
          "tasks.create": true, "tasks.edit": true, "tasks.move": true, "tasks.delete": true, "tasks.addUpdate": true,
          "trash.restore": true,
          "projects.create": true, "projects.rename": true, "projects.delete": true, "projects.manageMembers": true,
          "teams.create": true, "teams.rename": true, "teams.delete": true, "teams.manageMembers": true,
          "staff.create": true, "staff.edit": true, "staff.delete": true, "staff.assignRole": true,
          "schedule.create": true, "schedule.edit": true, "schedule.delete": true,
          "backup.export": true, "backup.import": true,
          "activity.viewOngoing": true,
          "settings.editPermissions": true
        },
        "Lead": {
          "tasks.create": true, "tasks.edit": true, "tasks.move": true, "tasks.delete": true, "tasks.addUpdate": true,
          "trash.restore": true,
          "projects.create": false, "projects.rename": false, "projects.delete": false, "projects.manageMembers": true,
          "teams.create": false, "teams.rename": false, "teams.delete": false, "teams.manageMembers": true,
          "staff.create": false, "staff.edit": false, "staff.delete": false, "staff.assignRole": false,
          "schedule.create": true, "schedule.edit": true, "schedule.delete": true,
          "backup.export": true, "backup.import": false,
          "activity.viewOngoing": true,
          "settings.editPermissions": false
        },
        "Senior Staff": {
          "tasks.create": true, "tasks.edit": true, "tasks.move": true, "tasks.delete": false, "tasks.addUpdate": true,
          "trash.restore": false,
          "projects.create": false, "projects.rename": false, "projects.delete": false, "projects.manageMembers": false,
          "teams.create": false, "teams.rename": false, "teams.delete": false, "teams.manageMembers": false,
          "staff.create": false, "staff.edit": false, "staff.delete": false, "staff.assignRole": false,
          "schedule.create": true, "schedule.edit": true, "schedule.delete": false,
          "backup.export": true, "backup.import": false,
          "activity.viewOngoing": true,
          "settings.editPermissions": false
        },
        "Junior Staff": {
          "tasks.create": false, "tasks.edit": false, "tasks.move": true, "tasks.delete": false, "tasks.addUpdate": true,
          "trash.restore": false,
          "projects.create": false, "projects.rename": false, "projects.delete": false, "projects.manageMembers": false,
          "teams.create": false, "teams.rename": false, "teams.delete": false, "teams.manageMembers": false,
          "staff.create": false, "staff.edit": false, "staff.delete": false, "staff.assignRole": false,
          "schedule.create": false, "schedule.edit": false, "schedule.delete": false,
          "backup.export": false, "backup.import": false,
          "activity.viewOngoing": true,
          "settings.editPermissions": false
        }
      };

      const isValidPermissionMatrix = value =>
        isRecord(value) &&
        PERMISSION_ROLES.every(role =>
          isRecord(value[role]) &&
          Object.values(value[role]).every(v => typeof v === "boolean")
        );

      const SCHEDULE_COLORS = [
        "#039be5", "#3f51b5", "#7986cb", "#8e24aa",
        "#e67c73", "#f4511e", "#f6bf26", "#33b679",
        "#0b8043", "#616161"
      ];

      const isValidScheduleEvent = event =>
        isRecord(event) &&
        typeof event.id === "string" &&
        typeof event.title === "string" &&
        typeof event.start === "string" &&
        typeof event.end === "string" &&
        (event.allDay === undefined || typeof event.allDay === "boolean") &&
        (event.description === undefined || typeof event.description === "string") &&
        (event.location === undefined || typeof event.location === "string") &&
        (event.project === undefined || typeof event.project === "string") &&
        (event.color === undefined || typeof event.color === "string") &&
        (event.guests === undefined || isStringArray(event.guests));

      const isValidSchedule = value =>
        isRecord(value) &&
        Array.isArray(value.events) &&
        value.events.every(isValidScheduleEvent);

      let tasks = readStoredJson(STORAGE_KEY, demoTasks, isRecordArray);
      tasks = tasks.map(task => taskWithOwners({
        ...task,
        status: task.status === "Backlog" ? "To Do" : task.status,
        priority: task.priority === "High" ? "High" : "Low"
      }, task.owners || task.owner));

      let teams = readStoredJson(TEAM_STORAGE_KEY, [...defaultTeams], isStringArray);

      let deletedTasks = readStoredJson(TRASH_STORAGE_KEY, [], isRecordArray);
      deletedTasks = deletedTasks.map(task => taskWithOwners({
        ...task
      }, task.owners || task.owner));

      let archivedTasks = readStoredJson(ARCHIVED_STORAGE_KEY, [], isRecordArray);
      archivedTasks = archivedTasks.map(task => taskWithOwners({
        ...task,
        archivedId: task.archivedId || crypto.randomUUID()
      }, task.owners || task.owner));

      let staff = readStoredJson(STAFF_STORAGE_KEY, [...defaultStaff], isStringArray);
      const existingOwners = [...new Set([
        ...tasks.flatMap(task => taskOwners(task)),
        ...deletedTasks.flatMap(task => taskOwners(task)),
        ...archivedTasks.flatMap(task => taskOwners(task))
      ].filter(Boolean))];
      existingOwners.forEach(name => {
        if (!staff.some(s => s.toLowerCase() === name.toLowerCase())) staff.push(name);
      });
      staff = [...new Set(staff)];

      function splitStaffName(fullName = "") {
        const parts = fullName.trim().split(/\s+/).filter(Boolean);
        return {
          firstName: parts.shift() || "",
          lastName: parts.join(" ")
        };
      }

      let staffProfiles = readStoredJson(
        STAFF_PROFILES_STORAGE_KEY,
        {},
        value => isRecord(value) && Object.values(value).every(isRecord)
      );

      staff.forEach(name => {
        if (!staffProfiles[name]) {
          const parsed = splitStaffName(name);
          staffProfiles[name] = {
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            role: "",
            permissionRole: DEFAULT_STAFF_PERMISSION_ROLE
          };
        }
      });

      let permissionMatrix = readStoredJson(PERMISSION_MATRIX_STORAGE_KEY, null, isValidPermissionMatrix);
      const isFirstPermissionsRun = permissionMatrix === null;
      if (isFirstPermissionsRun) permissionMatrix = structuredClone(DEFAULT_PERMISSION_MATRIX);

      PERMISSION_ROLES.forEach(role => {
        if (!permissionMatrix[role]) permissionMatrix[role] = {};
        PERMISSION_ACTIONS.forEach(action => {
          if (typeof permissionMatrix[role][action.id] !== "boolean") {
            permissionMatrix[role][action.id] = Boolean(DEFAULT_PERMISSION_MATRIX[role]?.[action.id]);
          }
        });
        // Older Admin-only Ongoing defaults blocked assigned staff from seeing
        // their own projects. Align with Completed / Deleted: everyone can view.
        if (role !== "Super Admin" && permissionMatrix[role]["activity.viewOngoing"] === false) {
          permissionMatrix[role]["activity.viewOngoing"] = true;
        }
      });

      // Backfill permissionRole on profiles that predate this feature (or have
      // a stale/invalid value), and make sure at least one Super Admin exists
      // so nobody gets locked out of Settings. This check is deliberately NOT
      // scoped to isFirstPermissionsRun — this local-folder-sync app can
      // reload from an on-disk backup that predates this feature (see
      // initializeFolderPersistence()/replaceLocalStorageFromBackup() below),
      // which would otherwise make isFirstPermissionsRun read false on the
      // very load where nobody has been promoted yet. Always self-healing to
      // "at least one Super Admin exists" is simpler and avoids that race.
      staff.forEach(name => {
        if (!PERMISSION_ROLES.includes(staffProfiles[name].permissionRole)) {
          staffProfiles[name].permissionRole = DEFAULT_STAFF_PERMISSION_ROLE;
        }
      });
      if (staff.length && !staff.some(name => staffProfiles[name].permissionRole === "Super Admin")) {
        staffProfiles[staff[0]].permissionRole = "Super Admin";
      }
      localStorage.setItem(PERMISSION_MATRIX_STORAGE_KEY, JSON.stringify(permissionMatrix));
      localStorage.setItem(STAFF_PROFILES_STORAGE_KEY, JSON.stringify(staffProfiles));

      // =====================================================================
      // AUTH — identity comes from the signed-in session (authUser).
      // Permission checks (can(), applyPermissionGating(), Settings) still
      // use the staff profile + permission matrix. Server-side saves also
      // re-check these actions so a client cannot escalate privileges.
      // =====================================================================
      let currentUserName = authUser?.staffMember.displayName || "";

      function getCurrentUser() {
        if (authUser?.staffMember) {
          const member = authUser.staffMember;
          const profile = staffProfiles[member.displayName];
          const permissionRole =
            profile?.permissionRole && PERMISSION_ROLES.includes(profile.permissionRole)
              ? profile.permissionRole
              : member.permissionRole;
          return {
            name: member.displayName,
            firstName: member.firstName,
            lastName: member.lastName,
            role: profile?.role ?? member.jobTitle,
            permissionRole,
          };
        }

        return staffProfiles[currentUserName]
          ? { name: currentUserName, ...staffProfiles[currentUserName] }
          : null;
      }

      function getCurrentUserRole() {
        const user = getCurrentUser();
        return (user && PERMISSION_ROLES.includes(user.permissionRole))
          ? user.permissionRole
          : DEFAULT_STAFF_PERMISSION_ROLE;
      }

      function canAccessSettings() {
        return can("settings.editPermissions");
      }

      function refreshPermissionsUi(options = {}) {
        const skipSettings = options.skipSettings === true;
        console.log("[project-config]", {
          layer: "ui",
          step: "refreshPermissionsUi",
          skipSettings,
          projectsViewActive: teamsView.classList.contains("active"),
        });
        applyPermissionGating();
        updateSidebarBrandMark();
        render();
        renderTrash();
        renderStaffManager();
        renderOrgTeamManager();
        renderTeamManager();
        updateOngoingCount();
        if (!skipSettings && settingsView.classList.contains("active")) {
          renderSettingsView();
        }
        if (scheduleView.classList.contains("active")) {
          renderScheduleView({ preserveScroll: true });
        }
        if (ongoingView.classList.contains("active")) {
          renderOngoingActivity();
        }
      }

      function can(actionId) {
        const role = getCurrentUserRole();
        if (role === "Super Admin") return true;
        return Boolean(permissionMatrix[role]?.[actionId]);
      }
      // =====================================================================

      // Organizational Teams are separate from Projects. A Team Member can
      // belong to any number of organizational Teams.
      let orgTeams = readStoredJson(ORG_TEAMS_STORAGE_KEY, [], isStringArray);
      let orgTeamMembers = readStoredJson(
        ORG_TEAM_MEMBERS_STORAGE_KEY,
        {},
        isStringArrayRecord
      );

      orgTeams.forEach(orgTeam => {
        const members = Array.isArray(orgTeamMembers[orgTeam]) ? orgTeamMembers[orgTeam] : [];
        orgTeamMembers[orgTeam] = [...new Set(members.filter(name => staff.includes(name)))];
      });

      function normalizeSchedule(value) {
        const events = Array.isArray(value?.events) ? value.events : [];
        return {
          events: events.map(event => ({
            id: typeof event.id === "string" && event.id ? event.id : crypto.randomUUID(),
            title: typeof event.title === "string" ? event.title : "",
            start: String(event.start || ""),
            end: String(event.end || ""),
            allDay: Boolean(event.allDay),
            description: typeof event.description === "string" ? event.description : "",
            location: typeof event.location === "string" ? event.location : "",
            project: typeof event.project === "string" && teams.includes(event.project) ? event.project : "",
            color: SCHEDULE_COLORS.includes(event.color) ? event.color : SCHEDULE_COLORS[0],
            guests: Array.isArray(event.guests)
              ? event.guests.filter(name => staff.includes(name))
              : []
          })).filter(event => event.start && event.end)
        };
      }

      let schedule = normalizeSchedule(
        readStoredJson(SCHEDULE_STORAGE_KEY, { events: [] }, isValidSchedule)
      );

      // Map of project name -> array of staff names.
      // Seed from existing task assignments when no saved membership data exists.
      let teamMembers = readStoredJson(
        TEAM_MEMBERS_STORAGE_KEY,
        null,
        isStringArrayRecord
      );
      if (!teamMembers) {
        teamMembers = {};
        teams.forEach(team => {
          teamMembers[team] = [];
        });

        tasks.forEach(task => {
          if (!task.team) return;
          if (!teamMembers[task.team]) teamMembers[task.team] = [];

          taskOwners(task).forEach(ownerName => {
            if (!teamMembers[task.team].includes(ownerName)) {
              teamMembers[task.team].push(ownerName);
            }
          });
        });
      }

      teams.forEach(team => {
        if (!teamMembers[team]) teamMembers[team] = [];
      });

      let teamLeaders = readStoredJson(
        TEAM_LEADERS_STORAGE_KEY,
        {},
        isStringRecord
      );
      teams.forEach(team => {
        if (!teamLeaders[team]) teamLeaders[team] = "";
        if (teamLeaders[team] && !(teamMembers[team] || []).includes(teamLeaders[team])) {
          teamLeaders[team] = "";
        }
      });

      let currentFilter = "All";
      let pendingAddTaskStatus = "";
      let currentOrgTeamFilter = "All";
      let currentStaffFilter = "All";
      let currentScheduleProjectFilter = "All";
      let currentScheduleOrgTeamFilter = "All";

      const board = document.getElementById("board");
      const appSidebar = document.getElementById("appSidebar");
      const sidebarCollapseBtn = document.getElementById("sidebarCollapseBtn");
      const mobileSidebarBtn = document.getElementById("mobileSidebarBtn");
      const sidebarBackdrop = document.getElementById("sidebarBackdrop");
      const currentUserSelect = document.getElementById("currentUserSelect");
      const exportDataBtn = document.getElementById("exportDataBtn");
      const importDataBtn = document.getElementById("importDataBtn");
      const importDataInput = document.getElementById("importDataInput");
      const backupStatus = document.getElementById("backupStatus");
      const teamFilter = document.getElementById("teamFilter");
      const orgTeamFilter = document.getElementById("orgTeamFilter");
      const staffFilter = document.getElementById("staffFilter");
      const clearFiltersBtn = document.getElementById("clearFiltersBtn");
      const teamManagerList = document.getElementById("teamManagerList");
      const newTeamName = document.getElementById("newTeamName");
      const projectFormFeedback = document.getElementById("projectFormFeedback");
      const orgTeamManagerList = document.getElementById("orgTeamManagerList");
      const newOrgTeamName = document.getElementById("newOrgTeamName");
      const orgTeamFormFeedback = document.getElementById("orgTeamFormFeedback");
      const trashList = document.getElementById("trashList");
      const trashCount = document.getElementById("trashCount");
      const completedTasksList = document.getElementById("completedTasksList");
      const archivedCount = document.getElementById("archivedCount");
      const ongoingCount = document.getElementById("ongoingCount");
      const ongoingSummary = document.getElementById("ongoingSummary");
      const ongoingList = document.getElementById("ongoingList");
      const ongoingSearch = document.getElementById("ongoingSearch");
      const ongoingDeptFilter = document.getElementById("ongoingDeptFilter");
      const ongoingNavBtn = document.getElementById("ongoingNavBtn");
      const staffManagerList = document.getElementById("staffManagerList");
      const staffFormFeedback = document.getElementById("staffFormFeedback");

      const tasksView = document.getElementById("tasksView");
      const orgTeamsView = document.getElementById("orgTeamsView");
      const staffView = document.getElementById("staffView");
      const teamsView = document.getElementById("teamsView");
      const trashView = document.getElementById("trashView");
      const completedTasksView = document.getElementById("completedTasksView");
      const ongoingView = document.getElementById("ongoingView");
      const settingsView = document.getElementById("settingsView");
      const permissionMatrixWrap = document.getElementById("permissionMatrixWrap");
      const resetPermissionsBtn = document.getElementById("resetPermissionsBtn");
      const savePermissionsBtn = document.getElementById("savePermissionsBtn");
      const permissionSaveStatus = document.getElementById("permissionSaveStatus");
      const scheduleView = document.getElementById("scheduleView");
      const scheduleNavBtn = document.getElementById("scheduleNavBtn");
      const addTaskProjectModalBackdrop = document.getElementById("addTaskProjectModalBackdrop");
      const addTaskProjectSelect = document.getElementById("addTaskProjectSelect");
      const addTaskProjectFeedback = document.getElementById("addTaskProjectFeedback");
      const addTaskProjectContinueBtn = document.getElementById("addTaskProjectContinueBtn");
      const addTaskProjectCancelBtn = document.getElementById("addTaskProjectCancelBtn");
      const addTaskProjectModalClose = document.getElementById("addTaskProjectModalClose");
      const scheduleTodayBtn = document.getElementById("scheduleTodayBtn");
      const schedulePrevBtn = document.getElementById("schedulePrevBtn");
      const scheduleNextBtn = document.getElementById("scheduleNextBtn");
      const scheduleRangeTitle = document.getElementById("scheduleRangeTitle");
      const scheduleCreateBtn = document.getElementById("scheduleCreateBtn");
      const scheduleProjectFilter = document.getElementById("scheduleProjectFilter");
      const scheduleOrgTeamFilter = document.getElementById("scheduleOrgTeamFilter");
      const scheduleClearFiltersBtn = document.getElementById("scheduleClearFiltersBtn");
      const scheduleAllDay = document.getElementById("scheduleAllDay");
      const scheduleTimedScroll = document.getElementById("scheduleTimedScroll");
      const scheduleTimed = document.getElementById("scheduleTimed");
      const scheduleModalBackdrop = document.getElementById("scheduleModalBackdrop");
      const scheduleModalTitle = document.getElementById("scheduleModalTitle");
      const scheduleModalClose = document.getElementById("scheduleModalClose");
      const scheduleEventTitle = document.getElementById("scheduleEventTitle");
      const scheduleEventAllDay = document.getElementById("scheduleEventAllDay");
      const scheduleEventDate = document.getElementById("scheduleEventDate");
      const scheduleEventDatePicker = document.getElementById("scheduleEventDatePicker");
      const scheduleEventDatePickerBtn = document.getElementById("scheduleEventDatePickerBtn");
      const scheduleEventStartTime = document.getElementById("scheduleEventStartTime");
      const scheduleEventEndTime = document.getElementById("scheduleEventEndTime");
      const scheduleStartTimeField = document.getElementById("scheduleStartTimeField");
      const scheduleEndTimeField = document.getElementById("scheduleEndTimeField");
      const scheduleDateTimeRow = document.getElementById("scheduleDateTimeRow");
      const scheduleEventLocation = document.getElementById("scheduleEventLocation");
      const scheduleEventProject = document.getElementById("scheduleEventProject");
      const scheduleEventDescription = document.getElementById("scheduleEventDescription");
      const scheduleProjectHelper = document.getElementById("scheduleProjectHelper");
      const scheduleProjectTeamPreview = document.getElementById("scheduleProjectTeamPreview");
      const scheduleProjectTeamList = document.getElementById("scheduleProjectTeamList");
      const scheduleGuestHelper = document.getElementById("scheduleGuestHelper");
      const scheduleGuestSelect = document.getElementById("scheduleGuestSelect");
      const scheduleGuestList = document.getElementById("scheduleGuestList");
      const scheduleColorRow = document.getElementById("scheduleColorRow");
      const scheduleEventDeleteBtn = document.getElementById("scheduleEventDeleteBtn");
      const scheduleEventCancelBtn = document.getElementById("scheduleEventCancelBtn");
      const scheduleEventSaveBtn = document.getElementById("scheduleEventSaveBtn");
      const tasksNavBtn = document.getElementById("tasksNavBtn");
      const sidebarBrandMark = document.getElementById("sidebarBrandMark");
      const taskFilters = document.getElementById("taskFilters");
      const workspaceTitle = document.getElementById("workspaceTitle");
      const workspaceSubtitle = document.getElementById("workspaceSubtitle");

      const SCHEDULE_HOUR_HEIGHT = 48;
      const SCHEDULE_DAY_START_HOUR = 7;
      const SCHEDULE_VISIBLE_HOURS = 13; // 7 AM through 8 PM
      const SCHEDULE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      let scheduleWeekStart = null;
      let scheduleEditingEventId = null;
      let scheduleSelectedColor = SCHEDULE_COLORS[0];
      let scheduleSelectedGuests = [];
      let scheduleDragCreate = null;
      let scheduleEventDrag = null;
      let scheduleNowTimer = null;

      function clearFormFeedback(inputs, feedback) {
        inputs.forEach(input => {
          input.classList.remove("input-invalid");
          input.removeAttribute("aria-invalid");
          if (input.getAttribute("aria-describedby") === feedback.id) {
            input.removeAttribute("aria-describedby");
          }
        });

        feedback.textContent = "";
        feedback.classList.remove("visible");
      }

      function showFormFeedback(inputs, feedback, message, focusInput = inputs[0]) {
        clearFormFeedback(inputs, feedback);

        inputs.forEach(input => {
          input.classList.add("input-invalid");
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", feedback.id);
        });

        feedback.textContent = message;
        feedback.classList.add("visible");
        focusInput?.focus();
      }

      function setBackupStatus(message, isError = false) {
        backupStatus.textContent = message;
        backupStatus.classList.toggle("visible", Boolean(message));
        backupStatus.classList.toggle("error", isError);
      }

      function createBackupPayload() {
        return {
          app: "company-task-tracker",
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          data: {
            tasks,
            teams,
            deletedTasks,
            archivedTasks,
            staff,
            staffProfiles,
            teamMembers,
            teamLeaders,
            orgTeams,
            orgTeamMembers,
            schedule,
            permissionMatrix,
            projectIds,
            orgTeamIds,
            staffIds,
          }
        };
      }

      function validateBackupPayload(backup) {
        if (!isRecord(backup)) return "The selected file is not a valid tracker backup.";
        if (backup.app !== "company-task-tracker") return "This file was not created by this task tracker.";
        if (backup.version !== BACKUP_VERSION) return `Backup version ${backup.version ?? "unknown"} is not supported.`;
        if (!isRecord(backup.data)) return "The backup does not contain tracker data.";

        const data = backup.data;
        const checks = [
          [isRecordArray(data.tasks), "tasks"],
          [isStringArray(data.teams), "projects"],
          [isRecordArray(data.deletedTasks), "deleted tasks"],
          [
            data.archivedTasks === undefined || isRecordArray(data.archivedTasks),
            "archived tasks"
          ],
          [isStringArray(data.staff), "team members"],
          [isRecord(data.staffProfiles) && Object.values(data.staffProfiles).every(isRecord), "team member profiles"],
          [isStringArrayRecord(data.teamMembers), "project memberships"],
          [isStringRecord(data.teamLeaders), "project leaders"],
          [isStringArray(data.orgTeams), "teams"],
          [isStringArrayRecord(data.orgTeamMembers), "team memberships"],
          [
            data.schedule === undefined || isValidSchedule(data.schedule),
            "schedule"
          ],
          [
            data.permissionMatrix === undefined || isValidPermissionMatrix(data.permissionMatrix),
            "permissions"
          ]
        ];

        const invalid = checks.find(([isValid]) => !isValid);
        return invalid ? `The backup contains invalid ${invalid[1]} data.` : "";
      }

      let folderPersistenceReady = false;
      let folderSyncPending = false;
      let folderSyncTimer = null;
      let folderSyncQueue = Promise.resolve();
      let trackerSync;
      let settingsSync;
      let permissionMatrixDirty = false;
      let permissionSaveInProgress = false;

      function usesLocalFolderServer() {
        return typeof window !== "undefined";
      }

      async function writeBackupToFolder(backup) {
        async function putWorkspace() {
          return fetch("/api/workspace", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(backup.data)
          });
        }

        let response = await putWorkspace();

        if (response.status === 401) {
          const refreshResponse = await fetch("/api/auth/me", {
            credentials: "include",
            cache: "no-store"
          });
          if (refreshResponse.ok) {
            response = await putWorkspace();
          } else {
            window.location.replace("/login");
            return;
          }
        }

        if (!response.ok) {
          throw new Error(`Folder save failed with status ${response.status}.`);
        }
      }

      function scheduleFolderSync() {
        if (!usesLocalFolderServer()) return;

        if (!folderPersistenceReady) {
          folderSyncPending = true;
          return;
        }

        // Recorded only for user-driven saves, so startup writes never make an
        // untouched browser look newer than the folder copy.
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());

        clearTimeout(folderSyncTimer);
        folderSyncTimer = setTimeout(() => {
          const backup = createBackupPayload();
          folderSyncQueue = folderSyncQueue
            .catch(() => {})
            .then(() => writeBackupToFolder(backup))
            .then(() => setBackupStatus("Saved to database."))
            .catch(error => {
              console.error("Could not save tracker data to the database.", error);
              setBackupStatus("Database auto-save failed. Export a backup for safety.", true);
            });
        }, 300);
      }

      function replaceLocalStorageFromBackup(backup) {
        const previousValues = {};
        Object.values(BACKUP_STORAGE_KEYS).forEach(key => {
          previousValues[key] = localStorage.getItem(key);
        });

        try {
          Object.entries(BACKUP_STORAGE_KEYS).forEach(([name, key]) => {
            const value = name === "schedule"
              ? (backup.data.schedule ?? { events: [] })
              : name === "permissionMatrix"
                ? (backup.data.permissionMatrix ?? DEFAULT_PERMISSION_MATRIX)
                : name === "archivedTasks"
                  ? (backup.data.archivedTasks ?? [])
                  : backup.data[name];
            localStorage.setItem(key, JSON.stringify(value));
          });
          if (backup.exportedAt) {
            localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, backup.exportedAt);
          }
        } catch (error) {
          Object.entries(previousValues).forEach(([key, value]) => {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          });
          throw error;
        }
      }

      async function initializeFolderPersistence() {
        folderPersistenceReady = true;
        setBackupStatus("Auto-save to database is on.");
        if (folderSyncPending) {
          folderSyncPending = false;
          if (!preloadData) {
            scheduleFolderSync();
          }
        }
      }

      function exportBackup() {
        if (!can("backup.export")) return;
        const backup = createBackupPayload();
        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const timestamp = backup.exportedAt.slice(0, 16).replace(/[:T]/g, "-");

        link.href = url;
        link.download = `task-tracker-backup-${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        setBackupStatus("Backup downloaded.");
      }

      async function importBackupFile(file) {
        if (!file || !can("backup.import")) return;

        try {
          const backup = JSON.parse(await file.text());
          const validationError = validateBackupPayload(backup);
          if (validationError) {
            setBackupStatus(validationError, true);
            return;
          }

          const confirmed = window.confirm(
            "Importing this backup will replace all current tasks, projects, teams, members, and deleted-task history. Continue?"
          );
          if (!confirmed) {
            setBackupStatus("Import cancelled.");
            return;
          }

          if (usesLocalFolderServer()) {
            try {
              await writeBackupToFolder(backup);
            } catch (error) {
              console.error("Could not copy imported data to the local folder.", error);
              setBackupStatus("Import stopped because the local data folder could not be updated.", true);
              return;
            }
          }

          replaceLocalStorageFromBackup(backup);
          window.location.reload();
        } catch (error) {
          console.error("Could not import tracker backup.", error);
          setBackupStatus("Could not read that backup file.", true);
        } finally {
          importDataInput.value = "";
        }
      }

      function persistTasksLocally() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
      }

      function save(dirtyTaskId) {
        persistTasksLocally();
        // Only PATCH tasks the user actually edited. Moves/deletes use dedicated endpoints.
        if (dirtyTaskId) trackerSync.markTasksDirty(dirtyTaskId);
        trackerSync.scheduleTaskSync();
      }

      function saveTrash() {
        localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(deletedTasks));
        updateTrashCount();
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
        trackerSync.scheduleTrashSync();
      }

      function saveArchivedTasks() {
        localStorage.setItem(ARCHIVED_STORAGE_KEY, JSON.stringify(archivedTasks));
        updateArchivedCount();
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
      }

      function updateTrashCount() {
        trashCount.textContent = deletedTasks.length;
      }

      function updateArchivedCount() {
        archivedCount.textContent = archivedTasks.length;
      }

      function getOpenTasks() {
        return tasks.filter(task => task.status !== "Done");
      }

      function updateOngoingCount() {
        if (!ongoingCount) return;
        ongoingCount.textContent = String(getOpenTasks().length);
      }

      function buildOngoingProjectActivity() {
        const me = getCurrentUser()?.name || currentUserName || "";
        const canSeeEveryone =
          getCurrentUserRole() === "Super Admin" || getCurrentUserRole() === "Admin";
        const openTasks = getOpenTasks();
        // Same visibility as Completed / Deleted: only projects already on your board
        // (assigned membership). Admins see everyone; staff see their own stats first.
        const projectNames = [...new Set(openTasks.map(task => task.team || "Unassigned"))]
          .sort((a, b) => {
            if (a === "Unassigned") return 1;
            if (b === "Unassigned") return -1;
            return a.localeCompare(b);
          });

        return projectNames.map(projectName => {
          const projectTasks = tasks.filter(task => (task.team || "Unassigned") === projectName);
          const openProjectTasks = projectTasks.filter(task => task.status !== "Done");
          const doneProjectTasks = projectTasks.filter(task => task.status === "Done");
          const progress = projectTasks.length
            ? Math.round((doneProjectTasks.length / projectTasks.length) * 100)
            : 0;

          let ownerNames = [...new Set(openProjectTasks.flatMap(task => taskOwners(task)))]
            .sort((a, b) => a.localeCompare(b));
          if (!canSeeEveryone && me) {
            const mine = ownerNames.filter(name => name === me);
            // Prefer your own open work; if you have none on this project yet,
            // still show teammates so assigned projects are not empty.
            if (mine.length) ownerNames = mine;
          }

          const people = ownerNames.map(name => {
            const ownedInProject = projectTasks.filter(task => taskOwners(task).includes(name));
            const openOwned = ownedInProject.filter(task => task.status !== "Done");
            const doneOwned = ownedInProject.filter(task => task.status === "Done").length;
            const profile = staffProfiles[name] || {};
            const department = String(profile.department || "").trim() || "No department";
            return {
              name,
              role: profile.role || "",
              department,
              openCount: openOwned.length,
              inProgressCount: openOwned.filter(task => task.status === "In Progress").length,
              todoCount: openOwned.filter(task => task.status === "To Do").length,
              doneCount: doneOwned,
              totalCount: ownedInProject.length,
              progress: ownedInProject.length
                ? Math.round((doneOwned / ownedInProject.length) * 100)
                : 0,
              openTasks: openOwned.sort((a, b) => {
                if (a.status === b.status) return (a.title || "").localeCompare(b.title || "");
                return a.status === "In Progress" ? -1 : 1;
              }),
            };
          }).filter(person => person.openCount > 0)
            .sort((a, b) => a.progress - b.progress || a.name.localeCompare(b.name));

          return {
            name: projectName,
            openCount: openProjectTasks.length,
            inProgressCount: openProjectTasks.filter(task => task.status === "In Progress").length,
            todoCount: openProjectTasks.filter(task => task.status === "To Do").length,
            doneCount: doneProjectTasks.length,
            totalCount: projectTasks.length,
            progress,
            people,
          };
        }).filter(project => project.people.length > 0);
      }

      function renderOngoingActivity() {
        if (!ongoingList || !ongoingSummary) return;

        const projects = buildOngoingProjectActivity();
        const openTasks = getOpenTasks();
        const activePeople = new Set(
          projects.flatMap(project => project.people.map(person => person.name))
        );
        const avgProgress = projects.length
          ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
          : 0;

        const search = String(ongoingSearch?.value || "").trim().toLowerCase();
        const deptFilter = ongoingDeptFilter?.value || "All";

        if (ongoingDeptFilter) {
          const selected = deptFilter;
          const departments = [...new Set(
            projects.flatMap(project => project.people.map(person => person.department))
          )].sort((a, b) => {
            if (a === "No department") return 1;
            if (b === "No department") return -1;
            return a.localeCompare(b);
          });
          ongoingDeptFilter.innerHTML = `<option value="All">All departments</option>${departments
            .map(dept => `<option value="${escapeHtml(dept)}">${escapeHtml(dept)}</option>`)
            .join("")}`;
          ongoingDeptFilter.value = departments.includes(selected) || selected === "All" ? selected : "All";
        }

        const selectedDept = ongoingDeptFilter?.value || "All";
        const visibleProjects = projects
          .map(project => {
            const people = project.people.filter(person => {
              const matchesDept = selectedDept === "All" || person.department === selectedDept;
              if (!matchesDept) return false;
              if (!search) return true;
              const haystack = [
                project.name,
                person.name,
                person.role,
                person.department,
                ...person.openTasks.map(task => task.title || ""),
              ]
                .join(" ")
                .toLowerCase();
              return haystack.includes(search);
            });
            const openCount = people.reduce((sum, person) => sum + person.openCount, 0);
            const inProgressCount = people.reduce((sum, person) => sum + person.inProgressCount, 0);
            const doneCount = people.reduce((sum, person) => sum + person.doneCount, 0);
            const totalCount = people.reduce((sum, person) => sum + person.totalCount, 0);
            return {
              ...project,
              people,
              openCount,
              inProgressCount,
              doneCount,
              totalCount,
              progress: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
            };
          })
          .filter(project => project.people.length > 0);

        ongoingSummary.innerHTML = `
          <article class="ongoing-summary-card">
            <span class="ongoing-summary-label">Projects in flight</span>
            <strong class="ongoing-summary-value">${projects.length}</strong>
          </article>
          <article class="ongoing-summary-card">
            <span class="ongoing-summary-label">People active</span>
            <strong class="ongoing-summary-value">${activePeople.size}</strong>
          </article>
          <article class="ongoing-summary-card">
            <span class="ongoing-summary-label">Open tasks</span>
            <strong class="ongoing-summary-value">${openTasks.length}</strong>
          </article>
          <article class="ongoing-summary-card">
            <span class="ongoing-summary-label">Avg progress</span>
            <strong class="ongoing-summary-value">${avgProgress}%</strong>
          </article>
        `;

        ongoingList.innerHTML = "";

        if (!visibleProjects.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = projects.length
            ? "No projects match this search or department filter."
            : "No ongoing work right now. Open tasks will appear here by project, then by employee.";
          ongoingList.appendChild(empty);
          updateOngoingCount();
          return;
        }

        visibleProjects.forEach(project => {
          const card = document.createElement("article");
          card.className = "ongoing-project-card is-collapsed";

          const header = document.createElement("button");
          header.type = "button";
          header.className = "ongoing-project-card-header";
          header.setAttribute("aria-expanded", "false");

          const identity = document.createElement("div");
          identity.className = "ongoing-project-identity";
          identity.innerHTML = `
            <strong class="ongoing-project-card-name">${escapeHtml(project.name)}</strong>
            <span class="ongoing-project-card-meta">${project.doneCount}/${project.totalCount} tasks done</span>
          `;

          const stats = document.createElement("div");
          stats.className = "ongoing-person-stats";
          stats.innerHTML = `
            <span class="ongoing-person-stat">${project.people.length} people</span>
            <span class="ongoing-person-stat">${project.openCount} open</span>
            <span class="ongoing-person-stat">${project.inProgressCount} in progress</span>
          `;

          const progressWrap = document.createElement("div");
          progressWrap.className = "ongoing-progress";
          progressWrap.innerHTML = `
            <div class="ongoing-progress-track" aria-hidden="true">
              <div class="ongoing-progress-fill" style="width:${project.progress}%"></div>
            </div>
            <span class="ongoing-progress-label">${project.progress}%</span>
          `;

          const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          chevron.setAttribute("class", "ongoing-person-chevron");
          chevron.setAttribute("viewBox", "0 0 24 24");
          chevron.setAttribute("aria-hidden", "true");
          const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          chevronPath.setAttribute("d", "M6 9.5 12 15l6-5.5");
          chevronPath.setAttribute("fill", "none");
          chevronPath.setAttribute("stroke", "currentColor");
          chevronPath.setAttribute("stroke-width", "2");
          chevronPath.setAttribute("stroke-linecap", "round");
          chevronPath.setAttribute("stroke-linejoin", "round");
          chevron.appendChild(chevronPath);

          header.appendChild(identity);
          header.appendChild(stats);
          header.appendChild(progressWrap);
          header.appendChild(chevron);

          const detail = document.createElement("div");
          detail.className = "ongoing-project-detail";
          detail.hidden = true;

          project.people.forEach(person => {
            const personBlock = document.createElement("section");
            personBlock.className = "ongoing-employee-block";

            personBlock.innerHTML = `
              <div class="ongoing-employee-header">
                <div class="ongoing-person-identity">
                  <strong class="ongoing-person-name">${escapeHtml(person.name)}</strong>
                  <span class="ongoing-person-meta">${escapeHtml(
                    [person.role || "No job title", person.department].filter(Boolean).join(" · ")
                  )}</span>
                </div>
                <div class="ongoing-person-stats">
                  <span class="ongoing-person-stat">${person.openCount} open</span>
                  <span class="ongoing-person-stat">${person.inProgressCount} in progress</span>
                </div>
                <div class="ongoing-progress ongoing-progress-compact">
                  <div class="ongoing-progress-track" aria-hidden="true">
                    <div class="ongoing-progress-fill" style="width:${person.progress}%"></div>
                  </div>
                  <span class="ongoing-progress-label">${person.progress}%</span>
                </div>
              </div>
            `;

            const taskList = document.createElement("ul");
            taskList.className = "ongoing-task-list";
            person.openTasks.forEach(task => {
              const item = document.createElement("li");
              item.className = "ongoing-task-item";
              item.innerHTML = `
                <span class="ongoing-task-status ongoing-task-status-${String(task.status || "")
                  .toLowerCase()
                  .replace(/\s+/g, "-")}">${escapeHtml(displayStatusLabel(task.status))}</span>
                <span class="ongoing-task-title">${escapeHtml(task.title || "Untitled task")}</span>
                <span class="ongoing-task-meta">${task.due ? `Due ${escapeHtml(task.due)}` : "No due date"} · ${escapeHtml(task.priority || "Low")}</span>
              `;
              taskList.appendChild(item);
            });

            personBlock.appendChild(taskList);
            detail.appendChild(personBlock);
          });

          header.addEventListener("click", () => {
            const willExpand = card.classList.contains("is-collapsed");
            card.classList.toggle("is-collapsed", !willExpand);
            detail.hidden = !willExpand;
            header.setAttribute("aria-expanded", willExpand ? "true" : "false");
          });

          card.appendChild(header);
          card.appendChild(detail);
          ongoingList.appendChild(card);
        });

        updateOngoingCount();
      }

      function formatDeletedAt(value) {
        if (!value) return "Unknown";
        const d = new Date(value);
        return d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        });
      }

      function renderSettingsView() {
        const groups = [...new Set(PERMISSION_ACTIONS.map(a => a.group))];

        permissionMatrixWrap.innerHTML = `
          <table class="permission-matrix">
            <thead>
              <tr>
                <th class="permission-action-col">Action</th>
                ${PERMISSION_ROLES.map(role => `<th>${escapeHtml(role)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${groups.map(group => `
                <tr class="permission-group-row"><td colspan="${PERMISSION_ROLES.length + 1}">${escapeHtml(group)}</td></tr>
                ${PERMISSION_ACTIONS.filter(a => a.group === group).map(action => `
                  <tr class="permission-row" data-action="${action.id}">
                    <td class="permission-action-label">${escapeHtml(action.label)}</td>
                    ${PERMISSION_ROLES.map(role => {
                      const isSuperAdmin = role === "Super Admin";
                      const checked = isSuperAdmin || Boolean(permissionMatrix[role][action.id]);
                      const disabled = isSuperAdmin || !can("settings.editPermissions");
                      return `<td class="permission-cell">
                        <input type="checkbox" data-role="${escapeHtml(role)}" data-action="${action.id}"
                          ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                      </td>`;
                    }).join("")}
                  </tr>
                `).join("")}
              `).join("")}
            </tbody>
          </table>
        `;

        permissionMatrixWrap.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
          checkbox.addEventListener("change", () => {
            const { role, action } = checkbox.dataset;
            permissionMatrix[role][action] = checkbox.checked;
            markPermissionMatrixDirty();
            refreshPermissionsUi({ skipSettings: true });
          });
        });

        resetPermissionsBtn.hidden = !can("settings.editPermissions");
        savePermissionsBtn.hidden = !can("settings.editPermissions");
        updatePermissionSaveUi();
      }

      function markPermissionMatrixDirty() {
        localStorage.setItem(PERMISSION_MATRIX_STORAGE_KEY, JSON.stringify(permissionMatrix));
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
        permissionMatrixDirty = true;
        updatePermissionSaveUi();
      }

      function updatePermissionSaveUi() {
        if (!savePermissionsBtn || !permissionSaveStatus) return;

        const canEdit = can("settings.editPermissions");
        savePermissionsBtn.hidden = !canEdit;
        resetPermissionsBtn.hidden = !canEdit;
        savePermissionsBtn.disabled = !canEdit || !permissionMatrixDirty || permissionSaveInProgress;
        savePermissionsBtn.textContent = permissionSaveInProgress ? "Saving..." : "Save Permissions";

        permissionSaveStatus.textContent = permissionMatrixDirty
          ? "You have unsaved permission changes."
          : permissionSaveInProgress
            ? "Saving permissions..."
            : "";
        permissionSaveStatus.classList.toggle("visible", permissionMatrixDirty);
        permissionSaveStatus.classList.toggle("saved", !permissionMatrixDirty && !permissionSaveInProgress && permissionSaveStatus.dataset.lastSaved === "true");
      }

      async function persistPermissionMatrix() {
        if (!can("settings.editPermissions") || permissionSaveInProgress) return false;

        permissionSaveInProgress = true;
        updatePermissionSaveUi();

        try {
          const response = await fetch("/api/permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ permissionMatrix }),
          });

          if (response.status === 401) {
            window.location.replace("/login");
            return false;
          }

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || `Save failed (${response.status}).`);
          }

          localStorage.setItem(PERMISSION_MATRIX_STORAGE_KEY, JSON.stringify(permissionMatrix));
          localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
          permissionMatrixDirty = false;
          if (permissionSaveStatus) {
            permissionSaveStatus.dataset.lastSaved = "true";
            permissionSaveStatus.textContent = "Permissions saved.";
            permissionSaveStatus.classList.remove("visible");
            permissionSaveStatus.classList.add("saved");
          }
          setBackupStatus("Permissions saved.");
          updatePermissionSaveUi();
          refreshPermissionsUi();
          return true;
        } catch (error) {
          console.error("Could not save permissions.", error);
          const message = error instanceof Error ? error.message : "Could not save permissions.";
          if (permissionSaveStatus) {
            permissionSaveStatus.textContent = message;
            permissionSaveStatus.classList.add("visible");
            permissionSaveStatus.classList.remove("saved");
          }
          setBackupStatus(message, true);
          updatePermissionSaveUi();
          return false;
        } finally {
          permissionSaveInProgress = false;
          updatePermissionSaveUi();
        }
      }

      function renderTrash() {
        trashList.innerHTML = "";

        if (!deletedTasks.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No deleted tasks.";
          trashList.appendChild(empty);
          return;
        }

        [...deletedTasks]
          .sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0))
          .forEach(task => {
            const item = document.createElement("article");
            item.className = "trash-item";

            const title = document.createElement("h3");
            title.textContent = task.title || "Untitled task";

            const meta = document.createElement("div");
            meta.className = "trash-meta";
            meta.innerHTML = `
              Project: <strong>${escapeHtml(task.team || "Unassigned")}</strong><br>
              Previous status: <strong>${escapeHtml(task.previousStatus || task.status || "Unknown")}</strong><br>
              Owners: <strong>${escapeHtml(ownerDisplayLabel(task) || "Unassigned")}</strong><br>
              Priority: <strong>${escapeHtml(task.priority || "Low")}</strong><br>
              ${task.due ? `Due: <strong>${escapeHtml(task.due)}</strong><br>` : ""}
              Deleted: <strong>${escapeHtml(formatDeletedAt(task.deletedAt))}</strong>
            `;

            const actions = document.createElement("div");
            actions.className = "trash-item-actions";

            const restoreBtn = document.createElement("button");
            restoreBtn.type = "button";
            restoreBtn.className = "restore-btn";
            restoreBtn.textContent = "Restore";
            restoreBtn.dataset.permission = "trash.restore";

            restoreBtn.addEventListener("click", () => {
              if (!can("trash.restore")) return;
              const { trashId, deletedAt, previousStatus, ...taskData } = task;
              const restored = {
                ...taskData,
                id: task.id || crypto.randomUUID(),
                title: task.title || "Untitled task",
                team: task.team || "Unassigned",
                owners: taskOwners(task),
                owner: taskOwners(task)[0] || "",
                priority: task.priority === "High" ? "High" : "Low",
                due: task.due || "",
                status: (previousStatus || task.status) === "Backlog" ? "To Do" : (previousStatus || task.status || "To Do"),
                updates: Array.isArray(task.updates) ? task.updates : []
              };

              if (!teams.includes(restored.team)) {
                teams.push(restored.team);
                        teamMembers[restored.team] = teamMembers[restored.team] || [];
                saveTeams();
                saveTeamMembers();
                populateTeamFilter();
              }

              tasks.push(restored);
              deletedTasks = deletedTasks.filter(t => t.id !== task.id);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
              localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(deletedTasks));
              updateTrashCount();
              renderTrash();
              render();
              if (trashId) {
                void trackerSync.syncTrashRestore(trashId);
              }
            });

            actions.appendChild(restoreBtn);
            item.appendChild(title);
            item.appendChild(meta);
            item.appendChild(actions);
            trashList.appendChild(item);
          });

        applyPermissionGating();
      }

      function renderCompletedTasks() {
        completedTasksList.innerHTML = "";

        if (!archivedTasks.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No completed tasks archived yet.";
          completedTasksList.appendChild(empty);
          return;
        }

        [...archivedTasks]
          .sort((a, b) => new Date(b.archivedAt || 0) - new Date(a.archivedAt || 0))
          .forEach(task => {
            const item = document.createElement("article");
            item.className = "trash-item";

            const title = document.createElement("h3");
            title.textContent = task.title || "Untitled task";

            const meta = document.createElement("div");
            meta.className = "trash-meta";
            meta.innerHTML = `
              Project: <strong>${escapeHtml(task.team || "Unassigned")}</strong><br>
              Owners: <strong>${escapeHtml(ownerDisplayLabel(task) || "Unassigned")}</strong><br>
              Priority: <strong>${escapeHtml(task.priority || "Low")}</strong><br>
              ${task.due ? `Due: <strong>${escapeHtml(task.due)}</strong><br>` : ""}
              Completed: <strong>${escapeHtml(formatDeletedAt(task.archivedAt))}</strong>
            `;

            item.appendChild(title);
            item.appendChild(meta);
            completedTasksList.appendChild(item);
          });
      }

      function saveStaff() {
        localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staff));
        scheduleFolderSync();
      }

      function saveStaffProfiles() {
        localStorage.setItem(STAFF_PROFILES_STORAGE_KEY, JSON.stringify(staffProfiles));
      }

      function saveOrgTeams() {
        localStorage.setItem(ORG_TEAMS_STORAGE_KEY, JSON.stringify(orgTeams));
      }

      function saveOrgTeamMembers() {
        localStorage.setItem(ORG_TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(orgTeamMembers));
      }

      function saveSchedule() {
        localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
        trackerSync.scheduleScheduleSync();
      }

      function orgTeamsForStaff(name) {
        return orgTeams.filter(orgTeam => (orgTeamMembers[orgTeam] || []).includes(name));
      }

      // Kept short so dropdown options never stretch their control.
      function staffTypeLabel(name) {
        const [first, ...rest] = orgTeamsForStaff(name);
        if (!first) return name;
        return rest.length ? `${name} · ${first} +${rest.length}` : `${name} · ${first}`;
      }

      function staffMetaLabel(name) {
        const profile = staffProfiles[name] || { role: "" };
        const memberships = orgTeamsForStaff(name);
        return [
          profile.role || "No job title",
          profile.department || "No department",
          memberships.length ? memberships.join(", ") : "No org teams"
        ].join(" · ");
      }

      function staffFirstName(name) {
        const profile = staffProfiles[name];
        if (profile && profile.firstName) return profile.firstName;
        return splitStaffName(name).firstName || name;
      }

      function ownerDisplayLabel(task) {
        return orderedStaffNames(taskOwners(task))
          .map(name => staffFirstName(name))
          .join(", ");
      }

      function renderStaffManager() {
        staffManagerList.innerHTML = "";
        staffManagerList.classList.add("staff-table", "staff-directory-table");

        const header = document.createElement("div");
        header.className = "staff-table-header";
        header.innerHTML = `
          <div>Name</div>
          <div>Email</div>
          <div>Job title</div>
          <div>Dept</div>
          <div>Office</div>
          <div>Workforce</div>
          <div>Permission</div>
        `;
        staffManagerList.appendChild(header);

        staff.forEach(name => {
          const profile = staffProfiles[name] || {
            ...splitStaffName(name),
            role: "",
            permissionRole: DEFAULT_STAFF_PERMISSION_ROLE,
            email: "",
            department: "",
            office: "",
            workforceRole: "Employee",
            employeeCode: ""
          };

          const row = document.createElement("div");
          row.className = "staff-row staff-directory-row";

          function cell(text, className) {
            const el = document.createElement("div");
            el.className = `staff-cell ${className || ""}`.trim();
            el.textContent = text || "—";
            if (text) el.title = text;
            return el;
          }

          const nameCell = document.createElement("div");
          nameCell.className = "staff-cell staff-name-cell";
          const nameWrap = document.createElement("div");
          nameWrap.className = "staff-display-wrap";
          const displayName = document.createElement("div");
          displayName.className = "staff-display-name";
          displayName.textContent = name;
          displayName.title = name;
          nameWrap.appendChild(displayName);
          if (profile.employeeCode) {
            const meta = document.createElement("div");
            meta.className = "staff-display-role";
            meta.textContent = profile.employeeCode;
            meta.title = `Employee code ${profile.employeeCode}`;
            nameWrap.appendChild(meta);
          }
          nameCell.appendChild(nameWrap);

          row.appendChild(nameCell);
          row.appendChild(cell(profile.email || "", "staff-email-cell"));
          row.appendChild(cell(profile.role || "", "staff-job-cell"));
          row.appendChild(cell(profile.department || "", "staff-dept-cell"));
          row.appendChild(cell(profile.office || "", "staff-office-cell"));
          row.appendChild(cell(profile.workforceRole || "Employee", "staff-workforce-role-cell"));

          const roleCell = document.createElement("div");
          roleCell.className = "staff-cell staff-permission-cell";
          const select = document.createElement("select");
          select.className = "staff-profile-permission-role";
          select.setAttribute("aria-label", `Permission role for ${name}`);
          select.dataset.permission = "staff.assignRole";
          select.dataset.permissionMode = "disable";
          const currentRole = PERMISSION_ROLES.includes(profile.permissionRole)
            ? profile.permissionRole
            : DEFAULT_STAFF_PERMISSION_ROLE;
          PERMISSION_ROLES.forEach(role => {
            const option = document.createElement("option");
            option.value = role;
            option.textContent = role;
            if (role === currentRole) option.selected = true;
            select.appendChild(option);
          });
          if (!can("staff.assignRole")) select.disabled = true;

          select.addEventListener("change", async () => {
            if (!can("staff.assignRole")) {
              select.value = currentRole;
              return;
            }
            const nextPermissionRole = select.value;
            const wasLastSuperAdmin = profile.permissionRole === "Super Admin" &&
              nextPermissionRole !== "Super Admin" &&
              staff.filter(n => n !== name).every(n => staffProfiles[n]?.permissionRole !== "Super Admin");
            if (wasLastSuperAdmin && !confirm(
              `${name} is the only Super Admin. Removing this role means no one will be able to reach Settings unless another Super Admin is assigned first. Continue?`
            )) {
              select.value = currentRole;
              return;
            }
            const staffId = staffIds[name];
            if (!staffId) {
              window.alert("Could not save — team member id missing. Refresh and try again.");
              select.value = currentRole;
              return;
            }
            select.disabled = true;
            try {
              await settingsSync.updateStaffRole(staffId, nextPermissionRole);
              staffProfiles[name] = {
                ...staffProfiles[name],
                firstName: profile.firstName,
                lastName: profile.lastName,
                role: profile.role,
                permissionRole: nextPermissionRole,
                email: profile.email,
                department: profile.department,
                office: profile.office,
                workforceRole: profile.workforceRole,
                employeeCode: profile.employeeCode
              };
              saveStaffProfiles();
              refreshPermissionsUi();
              renderStaffManager();
              render();
            } catch (error) {
              console.error("Permission role save failed.", error);
              select.value = currentRole;
              window.alert(error instanceof Error ? error.message : "Could not update permission role.");
            } finally {
              select.disabled = !can("staff.assignRole");
            }
          });

          roleCell.appendChild(select);
          row.appendChild(roleCell);
          staffManagerList.appendChild(row);
        });

        if (!staff.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No Workforce people synced yet. Add employees in the admin portal — they appear here automatically.";
          staffManagerList.appendChild(empty);
        }

        applyPermissionGating();
      }

      // Wires handle-initiated drag reordering for a manager row.
      // getList returns the current list; onReorder receives the reordered list.
      function attachRowReorder({ row, handle, container, value, state, getList, onReorder }) {
        let dragArmed = false;

        const armDrag = e => {
          e.stopPropagation();
          dragArmed = true;
          row.draggable = true;
        };

        handle.addEventListener("pointerdown", armDrag);
        handle.addEventListener("mousedown", armDrag);

        handle.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
        });

        row.addEventListener("dragstart", e => {
          if (!dragArmed) {
            e.preventDefault();
            return;
          }

          state.dragged = value;
          row.classList.add("reorder-dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", value);
        });

        row.addEventListener("dragover", e => {
          const dragged = state.dragged;
          if (!dragged || dragged === value || !getList().includes(dragged)) return;

          e.preventDefault();
          e.dataTransfer.dropEffect = "move";

          clearReorderIndicators(container);
          const rect = row.getBoundingClientRect();
          const placeAfter = e.clientY > rect.top + rect.height / 2;
          row.classList.add(placeAfter ? "reorder-drop-after" : "reorder-drop-before");
        });

        row.addEventListener("drop", e => {
          e.preventDefault();

          const dragged = state.dragged || e.dataTransfer.getData("text/plain");
          if (!dragged || dragged === value || !getList().includes(dragged)) return;

          const rect = row.getBoundingClientRect();
          const placeAfter = e.clientY > rect.top + rect.height / 2;

          onReorder(reorderListByDrop(getList(), dragged, value, placeAfter));
        });

        row.addEventListener("dragend", () => {
          state.dragged = "";
          dragArmed = false;
          row.draggable = false;
          row.classList.remove("reorder-dragging");
          clearReorderIndicators(container);
        });
      }

      function reorderListByDrop(list, draggedValue, targetValue, placeAfter) {
        if (!draggedValue || !targetValue || draggedValue === targetValue) return [...list];

        const next = list.filter(value => value !== draggedValue);
        let targetIndex = next.indexOf(targetValue);

        if (targetIndex < 0) return [...list];
        if (placeAfter) targetIndex += 1;

        next.splice(targetIndex, 0, draggedValue);
        return next;
      }

      function createReorderHandle(label) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "reorder-handle";
        handle.setAttribute("aria-label", label);
        handle.title = label;
        handle.innerHTML = Array.from({ length: 9 }, () => '<span class="reorder-dot"></span>').join("");
        return handle;
      }

      function clearReorderIndicators(container) {
        container.querySelectorAll(".reorder-drop-before, .reorder-drop-after").forEach(row => {
          row.classList.remove("reorder-drop-before", "reorder-drop-after");
        });
      }

      function orderedStaffNames(names) {
        const selected = normalizeOwners(names);
        const active = staff.filter(name => selected.includes(name));
        const inactive = selected.filter(name => !staff.includes(name));
        return [...active, ...inactive];
      }

      function saveTeamMembers() {
        localStorage.setItem(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(teamMembers));
      }

      function saveTeamLeaders() {
        localStorage.setItem(TEAM_LEADERS_STORAGE_KEY, JSON.stringify(teamLeaders));
      }

      function membersForTeam(team) {
        const members = teamMembers[team] || [];
        return staff.filter(name => members.includes(name));
      }

      // Summary stays one line wide regardless of how many owners are picked.
      function ownerChecklistLabelHtml(selected, totalSelectable) {
        if (!selected.length) {
          return '<span class="owner-checklist-label-name">Unassigned</span>';
        }

        if (totalSelectable > 1 && selected.length === totalSelectable) {
          return `<span class="owner-checklist-label-name">Everyone</span><span class="owner-checklist-label-count">${selected.length}</span>`;
        }

        const [first, ...rest] = selected;
        const extra = rest.length
          ? `<span class="owner-checklist-label-count">+${rest.length}</span>`
          : "";

        return `<span class="owner-checklist-label-name">${escapeHtml(first)}</span>${extra}`;
      }

      function ownerChecklistInnerHtml(team, selectedOwners = []) {
        const selected = orderedStaffNames(selectedOwners);
        const members = membersForTeam(team);
        const visibleNames = [...members];

        selected.forEach(name => {
          if (!visibleNames.includes(name)) visibleNames.push(name);
        });

        const allSelected = visibleNames.length > 0 && visibleNames.every(name => selected.includes(name));

        return `
          <summary>
            <span class="owner-checklist-label">${ownerChecklistLabelHtml(selected, visibleNames.length)}</span>
            <span class="owner-checklist-chevron" aria-hidden="true">▾</span>
          </summary>
          <div class="owner-checklist-menu">
            ${visibleNames.length ? `
              <div class="owner-checklist-search-wrap">
                <input
                  type="search"
                  class="owner-checklist-search"
                  placeholder="Search people…"
                  aria-label="Search owners"
                  autocomplete="off"
                >
              </div>
            ` : ""}
            <div class="owner-checklist-options">
              ${visibleNames.length ? `
                <label class="owner-checklist-option owner-checklist-select-all">
                  <input type="checkbox" class="owner-checklist-all"${allSelected ? " checked" : ""}>
                  <span>All (${visibleNames.length})</span>
                </label>
              ` : ""}
              ${visibleNames.length ? visibleNames.map(name => {
                const checked = selected.includes(name) ? " checked" : "";
                const suffix = members.includes(name) ? "" : " (not in project)";
                const label = staffTypeLabel(name) + suffix;
                return `
                  <label class="owner-checklist-option" data-owner-label="${escapeHtml(label.toLowerCase())}">
                    <input type="checkbox" data-owner value="${escapeHtml(name)}"${checked}>
                    <span>${escapeHtml(label)}</span>
                  </label>
                `;
              }).join("") : '<div class="owner-checklist-empty">No project members assigned</div>'}
            </div>
            <div class="owner-checklist-footer">
              <button type="button" class="owner-checklist-done">Done</button>
            </div>
          </div>
        `;
      }

      function setOwnerChecklist(root, team, selectedOwners = []) {
        root.innerHTML = ownerChecklistInnerHtml(team, selectedOwners);
        bindOwnerChecklist(root);
      }

      function ownerCheckboxes(root) {
        return [...root.querySelectorAll(".owner-checklist-option input[data-owner]")];
      }

      function selectedOwnersFromChecklist(root) {
        return ownerCheckboxes(root)
          .filter(input => input.checked)
          .map(input => input.value);
      }

      function refreshOwnerChecklistLabel(root) {
        const boxes = ownerCheckboxes(root);
        const selected = boxes.filter(input => input.checked).map(input => input.value);
        const label = root.querySelector(".owner-checklist-label");
        if (label) label.innerHTML = ownerChecklistLabelHtml(selected, boxes.length);

        const allToggle = root.querySelector(".owner-checklist-all");
        if (allToggle) {
          const visibleBoxes = boxes.filter(input => {
            const option = input.closest(".owner-checklist-option");
            return !option?.hidden;
          });
          const visibleSelected = visibleBoxes.filter(input => input.checked).length;
          allToggle.checked = visibleBoxes.length > 0 && visibleSelected === visibleBoxes.length;
          allToggle.indeterminate = visibleSelected > 0 && visibleSelected < visibleBoxes.length;
        }
      }

      function filterOwnerChecklistOptions(root) {
        const searchInput = root.querySelector(".owner-checklist-search");
        const query = String(searchInput?.value || "").trim().toLowerCase();
        const options = [...root.querySelectorAll(".owner-checklist-option[data-owner-label]")];
        let visibleCount = 0;

        options.forEach(option => {
          const label = String(option.getAttribute("data-owner-label") || "");
          const match = !query || label.includes(query);
          option.hidden = !match;
          if (match) visibleCount += 1;
        });

        const selectAll = root.querySelector(".owner-checklist-select-all");
        if (selectAll) {
          selectAll.hidden = Boolean(query) && visibleCount === 0;
          const selectAllLabel = selectAll.querySelector("span");
          if (selectAllLabel) {
            selectAllLabel.textContent = query
              ? `All visible (${visibleCount})`
              : `All (${options.length})`;
          }
        }

        let empty = root.querySelector(".owner-checklist-search-empty");
        if (query && visibleCount === 0) {
          if (!empty) {
            empty = document.createElement("div");
            empty.className = "owner-checklist-empty owner-checklist-search-empty";
            empty.textContent = "No people match this search.";
            root.querySelector(".owner-checklist-options")?.appendChild(empty);
          }
        } else if (empty) {
          empty.remove();
        }
      }

      function bindOwnerChecklist(root) {
        ownerCheckboxes(root).forEach(input => {
          input.addEventListener("change", () => refreshOwnerChecklistLabel(root));
        });

        const allToggle = root.querySelector(".owner-checklist-all");
        if (allToggle) {
          allToggle.addEventListener("change", () => {
            const query = String(root.querySelector(".owner-checklist-search")?.value || "")
              .trim()
              .toLowerCase();
            ownerCheckboxes(root).forEach(input => {
              const option = input.closest(".owner-checklist-option");
              if (query && option?.hidden) return;
              input.checked = allToggle.checked;
            });
            refreshOwnerChecklistLabel(root);
          });
        }

        const searchInput = root.querySelector(".owner-checklist-search");
        if (searchInput) {
          searchInput.addEventListener("input", () => {
            filterOwnerChecklistOptions(root);
            refreshOwnerChecklistLabel(root);
          });
          searchInput.addEventListener("click", event => event.stopPropagation());
          searchInput.addEventListener("keydown", event => event.stopPropagation());
        }

        const doneBtn = root.querySelector(".owner-checklist-done");
        if (doneBtn) {
          doneBtn.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            root.open = false;
          });
        }

        filterOwnerChecklistOptions(root);
        refreshOwnerChecklistLabel(root);
      }

      if (!window.__ownerChecklistOutsideCloseBound) {
        window.__ownerChecklistOutsideCloseBound = true;
        document.addEventListener(
          "pointerdown",
          event => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            document.querySelectorAll("details.owner-checklist[open]").forEach(details => {
              if (!details.contains(target)) {
                details.open = false;
              }
            });
          },
          true
        );
      }

      function pad2(n) {
        return String(n).padStart(2, "0");
      }

      function startOfWeekMonday(date) {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - day);
        d.setHours(0, 0, 0, 0);
        return d;
      }

      function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
      }

      function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() &&
          a.getMonth() === b.getMonth() &&
          a.getDate() === b.getDate();
      }

      function toDateKey(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
      }

      function parseDateKey(key) {
        const [y, m, d] = key.split("-").map(Number);
        return new Date(y, m - 1, d);
      }

      function toLocalDateTimeValue(date) {
        return `${toDateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
      }

      function fromLocalDateTimeValue(value) {
        if (!value) return new Date();
        if (value.length === 10) return parseDateKey(value);
        if (value.includes("Z") || /\.\d{3}Z?$/.test(value)) {
          const parsed = new Date(value);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        const [datePart, timePart = "00:00"] = value.split("T");
        const [y, m, d] = datePart.split("-").map(Number);
        const [hh, mm] = timePart.split(":").map(Number);
        return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
      }

      function formatHourLabel(hour) {
        const suffix = hour < 12 ? "AM" : "PM";
        const h = hour % 12 || 12;
        return `${h} ${suffix}`;
      }

      function formatEventTime(date) {
        const h = date.getHours();
        const m = date.getMinutes();
        const suffix = h < 12 ? "AM" : "PM";
        const hour = h % 12 || 12;
        return m ? `${hour}:${pad2(m)} ${suffix}` : `${hour} ${suffix}`;
      }

      function formatWeekRangeTitle(weekStart) {
        const weekEnd = addDays(weekStart, 6);
        const startMonth = weekStart.toLocaleString("en-US", { month: "long" });
        const endMonth = weekEnd.toLocaleString("en-US", { month: "long" });
        if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
          return `${startMonth} ${weekStart.getDate()}, ${weekStart.getFullYear()} – ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
        }
        if (weekStart.getMonth() !== weekEnd.getMonth()) {
          return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
        }
        return `${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      }

      function ensureScheduleWeek() {
        if (!scheduleWeekStart) scheduleWeekStart = startOfWeekMonday(new Date());
      }

      function scheduleWeekDays() {
        ensureScheduleWeek();
        return Array.from({ length: 7 }, (_, i) => addDays(scheduleWeekStart, i));
      }

      function getScheduleEventById(id) {
        return schedule.events.find(event => event.id === id) || null;
      }

      function eventStartDate(event) {
        return event.allDay ? parseDateKey(event.start.slice(0, 10)) : fromLocalDateTimeValue(event.start);
      }

      function eventEndDate(event) {
        return event.allDay ? parseDateKey(event.end.slice(0, 10)) : fromLocalDateTimeValue(event.end);
      }

      function minutesFromDayStart(date) {
        return date.getHours() * 60 + date.getMinutes();
      }

      function minutesFromScheduleStart(date) {
        let minutes = minutesFromDayStart(date) - SCHEDULE_DAY_START_HOUR * 60;
        if (minutes < 0) minutes += 24 * 60;
        return minutes;
      }

      function snapMinutes(totalMinutes, step = 15) {
        return Math.round(totalMinutes / step) * step;
      }

      function clampScheduleMinutes(minutes) {
        const max = SCHEDULE_VISIBLE_HOURS * 60;
        return Math.min(max, Math.max(0, minutes));
      }

      // Google Calendar-style overlap layout: events that overlap in time share
      // the day column as equal-width side-by-side slots instead of stacking.
      function layoutOverlappingEvents(items) {
        const sorted = [...items].sort((a, b) =>
          a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
        );

        let cluster = [];
        let clusterEnd = -Infinity;

        const packCluster = () => {
          const columnEnds = [];
          cluster.forEach(item => {
            let col = columnEnds.findIndex(end => end <= item.startMinutes);
            if (col === -1) {
              col = columnEnds.length;
              columnEnds.push(item.endMinutes);
            } else {
              columnEnds[col] = item.endMinutes;
            }
            item.col = col;
          });
          cluster.forEach(item => {
            item.colCount = columnEnds.length;
          });
          cluster = [];
        };

        sorted.forEach(item => {
          if (cluster.length && item.startMinutes >= clusterEnd) {
            packCluster();
            clusterEnd = -Infinity;
          }
          cluster.push(item);
          clusterEnd = Math.max(clusterEnd, item.endMinutes);
        });
        if (cluster.length) packCluster();

        return sorted;
      }

      function toDateInputValue(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
      }

      function parseDateInputValue(value) {
        const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        const day = Number(match[3]);
        if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
        const date = new Date(year, monthIndex, day);
        if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) return null;
        return date;
      }

      function syncScheduleNativeDatePicker(date) {
        if (!scheduleEventDatePicker || !date) return;
        scheduleEventDatePicker.value = toDateInputValue(date);
      }

      function openScheduleDatePicker() {
        if (!scheduleEventDatePicker || scheduleEventDatePicker.disabled) return;
        const parsed = parseDisplayDate(scheduleEventDate.value);
        if (parsed) syncScheduleNativeDatePicker(parsed);
        if (typeof scheduleEventDatePicker.showPicker === "function") {
          try {
            scheduleEventDatePicker.showPicker();
            return;
          } catch (error) {
            // Fall through to click fallback.
          }
        }
        try {
          scheduleEventDatePicker.click();
        } catch (error) {
          scheduleEventDatePicker.focus();
        }
      }

      function formatDisplayDate(date) {
        return `${pad2(date.getDate())}-${SCHEDULE_MONTHS[date.getMonth()]}-${date.getFullYear()}`;
      }

      function parseDisplayDate(value) {
        const match = String(value || "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
        if (!match) return null;
        const day = Number(match[1]);
        const monthIndex = SCHEDULE_MONTHS.findIndex(m => m.toLowerCase() === match[2].toLowerCase());
        const year = Number(match[3]);
        if (monthIndex < 0 || day < 1 || day > 31) return null;
        const date = new Date(year, monthIndex, day);
        if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) return null;
        return date;
      }

      function toTimeInputValue(date) {
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
      }

      function applyTimeToDate(date, timeValue) {
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const [hh = "0", mm = "0"] = String(timeValue || "00:00").split(":");
        next.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
        return next;
      }

      function openScheduleModal(eventData, isNew = false) {
        scheduleEditingEventId = isNew ? null : eventData.id;
        scheduleSelectedColor = eventData.color || SCHEDULE_COLORS[0];
        scheduleSelectedGuests = [...(eventData.guests || [])];
        scheduleModalTitle.textContent = isNew ? "New event" : "Event";
        scheduleEventTitle.value = eventData.title || "";
        scheduleEventAllDay.checked = Boolean(eventData.allDay);
        scheduleEventLocation.value = eventData.location || "";
        scheduleEventDescription.value = eventData.description || "";

        const canSave = isNew ? can("schedule.create") : can("schedule.edit");
        scheduleEventSaveBtn.dataset.permission = isNew ? "schedule.create" : "schedule.edit";
        scheduleEventSaveBtn.hidden = !canSave;
        scheduleEventDeleteBtn.hidden = isNew || !can("schedule.delete");
        scheduleEventSaveBtn.dataset.nonPermissionDisabled = canSave ? "false" : "true";
        scheduleEventSaveBtn.disabled = !canSave;

        const scheduleFields = [
          scheduleEventTitle,
          scheduleEventAllDay,
          scheduleEventDate,
          scheduleEventDatePicker,
          scheduleEventStartTime,
          scheduleEventEndTime,
          scheduleEventLocation,
          scheduleEventProject,
          scheduleEventDescription,
          scheduleGuestSelect,
        ];
        scheduleFields.forEach(field => {
          if (field) field.disabled = !canSave;
        });
        if (scheduleEventDatePickerBtn) scheduleEventDatePickerBtn.disabled = !canSave;
        scheduleColorRow.querySelectorAll("button").forEach(btn => {
          btn.disabled = !canSave;
        });

        const start = eventStartDate(eventData);
        let end = eventEndDate(eventData);
        if (eventData.allDay) end = addDays(end, -1);
        syncScheduleModalTimeInputs(start, end, scheduleEventAllDay.checked);
        renderScheduleProjectDropdown();
        scheduleEventProject.value = teams.includes(eventData.project) ? eventData.project : "";
        renderScheduleProjectSection();
        renderScheduleGuestDropdown();
        renderScheduleColorSwatches();
        applyPermissionGating(scheduleModalBackdrop);
        scheduleModalBackdrop.hidden = false;
        scheduleEventTitle.focus();
      }

      function syncScheduleModalTimeInputs(start, end, allDay) {
        scheduleEventDate.value = formatDisplayDate(start);
        syncScheduleNativeDatePicker(start);
        scheduleEventStartTime.value = toTimeInputValue(start);
        scheduleEventEndTime.value = toTimeInputValue(end <= start ? new Date(start.getTime() + 60 * 60 * 1000) : end);
        scheduleStartTimeField.hidden = allDay;
        scheduleEndTimeField.hidden = allDay;
        scheduleDateTimeRow.classList.toggle("schedule-datetime-row", !allDay);
      }

      function closeScheduleModal() {
        scheduleModalBackdrop.hidden = true;
        scheduleEditingEventId = null;
        scheduleSelectedGuests = [];
      }

      function renderScheduleProjectDropdown() {
        scheduleEventProject.innerHTML = '<option value="">No project</option>';
        teams.forEach(team => {
          const option = document.createElement("option");
          option.value = team;
          option.textContent = team;
          scheduleEventProject.appendChild(option);
        });
      }

      function selectedScheduleProject() {
        return scheduleEventProject?.value || "";
      }

      function scheduleGuestPool() {
        const project = selectedScheduleProject();
        if (!project) return [...staff];

        const members = membersForTeam(project);
        const memberSet = new Set(members);
        const projectFirst = [...members];
        staff.forEach(name => {
          if (!memberSet.has(name)) projectFirst.push(name);
        });
        return projectFirst;
      }

      function updateScheduleHelperText() {
        const project = selectedScheduleProject();
        if (scheduleProjectHelper) {
          scheduleProjectHelper.textContent = project
            ? "Everyone on this project can see this event on the schedule."
            : "Leave blank for a personal event visible only to invited guests.";
        }
        if (scheduleGuestHelper) {
          scheduleGuestHelper.textContent = project
            ? "Pick anyone from the team. Guests are invited to this event only — they are not added to the project. All project members are also notified."
            : "Only invited guests can see this event.";
        }
      }

      function renderScheduleProjectTeamPreview() {
        if (!scheduleProjectTeamPreview || !scheduleProjectTeamList) return;
        const project = selectedScheduleProject();
        if (!project) {
          scheduleProjectTeamPreview.hidden = true;
          scheduleProjectTeamList.innerHTML = "";
          return;
        }

        const members = membersForTeam(project);
        scheduleProjectTeamPreview.hidden = false;
        scheduleProjectTeamList.innerHTML = members.length
          ? members.map(name => `<li>${escapeHtml(staffTypeLabel(name))}</li>`).join("")
          : '<li class="schedule-project-team-empty">No members assigned yet</li>';
      }

      function renderScheduleProjectSection() {
        updateScheduleHelperText();
        renderScheduleProjectTeamPreview();
      }

      function scheduleEventTooltip(event) {
        const parts = [event.title || "(No title)"];
        if (event.project) parts.push(`Project: ${event.project}`);
        const guestCount = Array.isArray(event.guests) ? event.guests.length : 0;
        if (guestCount) parts.push(`${guestCount} guest${guestCount === 1 ? "" : "s"}`);
        return parts.join(" · ");
      }

      function renderScheduleGuestDropdown() {
        const project = selectedScheduleProject();
        const projectMembers = project ? membersForTeam(project) : [];
        scheduleGuestSelect.innerHTML = '<option value="">Add guest...</option>';
        scheduleGuestPool().forEach(name => {
          if (scheduleSelectedGuests.includes(name)) return;
          const option = document.createElement("option");
          option.value = name;
          const suffix = project && !projectMembers.includes(name) ? " (not in project)" : "";
          option.textContent = staffTypeLabel(name) + suffix;
          scheduleGuestSelect.appendChild(option);
        });

        scheduleGuestList.innerHTML = "";
        scheduleSelectedGuests.forEach(name => {
          const chip = document.createElement("span");
          const notInProject = project && !projectMembers.includes(name);
          chip.className = "schedule-guest-chip" + (notInProject ? " not-in-project" : "");
          chip.appendChild(document.createTextNode(staffFirstName(name) + (notInProject ? "*" : "")));
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.setAttribute("aria-label", `Remove ${name}`);
          removeBtn.textContent = "×";
          removeBtn.addEventListener("click", () => {
            scheduleSelectedGuests = scheduleSelectedGuests.filter(guest => guest !== name);
            renderScheduleGuestDropdown();
          });
          chip.appendChild(removeBtn);
          scheduleGuestList.appendChild(chip);
        });
      }

      function renderScheduleColorSwatches() {
        scheduleColorRow.innerHTML = "";
        SCHEDULE_COLORS.forEach(color => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "schedule-color-swatch" + (color === scheduleSelectedColor ? " selected" : "");
          btn.style.background = color;
          btn.setAttribute("aria-label", `Color ${color}`);
          btn.addEventListener("click", () => {
            scheduleSelectedColor = color;
            renderScheduleColorSwatches();
          });
          scheduleColorRow.appendChild(btn);
        });
      }

      function saveScheduleModalEvent() {
        const isNewEvent = !scheduleEditingEventId;
        if (!can(isNewEvent ? "schedule.create" : "schedule.edit")) return;
        const title = scheduleEventTitle.value.trim() || "(No title)";
        const allDay = scheduleEventAllDay.checked;
        const date = parseDisplayDate(scheduleEventDate.value);
        if (!date) {
          scheduleEventDate.focus();
          scheduleEventDate.select();
          return;
        }

        let start;
        let end;
        if (allDay) {
          start = date;
          end = addDays(date, 1);
        } else {
          start = applyTimeToDate(date, scheduleEventStartTime.value);
          end = applyTimeToDate(date, scheduleEventEndTime.value);
          if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
        }

        const payload = {
          id: scheduleEditingEventId || crypto.randomUUID(),
          title,
          allDay,
          start: allDay ? toDateKey(start) : toLocalDateTimeValue(start),
          end: allDay ? toDateKey(end) : toLocalDateTimeValue(end),
          location: scheduleEventLocation.value.trim(),
          project: scheduleEventProject.value,
          description: scheduleEventDescription.value.trim(),
          color: scheduleSelectedColor,
          guests: [...scheduleSelectedGuests]
        };

        const index = schedule.events.findIndex(event => event.id === payload.id);
        if (index >= 0) schedule.events[index] = payload;
        else schedule.events.push(payload);

        saveSchedule();
        closeScheduleModal();
        renderScheduleView();
        void trackerSync.syncScheduleEvent(payload.id);
      }

      function deleteScheduleModalEvent() {
        if (!scheduleEditingEventId) {
          closeScheduleModal();
          return;
        }
        if (!can("schedule.delete")) return;
        const deletedId = scheduleEditingEventId;
        schedule.events = schedule.events.filter(event => event.id !== deletedId);
        saveSchedule();
        closeScheduleModal();
        renderScheduleView();
        void trackerSync.syncScheduleDelete(deletedId);
      }

      function createDraftEvent(start, end, allDay = false) {
        const project =
          currentScheduleProjectFilter !== "All" && teams.includes(currentScheduleProjectFilter)
            ? currentScheduleProjectFilter
            : "";
        return {
          id: crypto.randomUUID(),
          title: "",
          start: allDay ? toDateKey(start) : toLocalDateTimeValue(start),
          end: allDay ? toDateKey(end) : toLocalDateTimeValue(end),
          allDay,
          description: "",
          location: "",
          project,
          color: SCHEDULE_COLORS[0],
          guests: []
        };
      }

      function matchesScheduleFilters(event) {
        const matchesProject =
          currentScheduleProjectFilter === "All" || event.project === currentScheduleProjectFilter;

        const matchesOrgTeam =
          currentScheduleOrgTeamFilter === "All" ||
          (event.guests || []).some(name => orgTeamsForStaff(name).includes(currentScheduleOrgTeamFilter));

        return matchesProject && matchesOrgTeam;
      }

      function eventsForDay(day) {
        const key = toDateKey(day);
        return schedule.events.filter(event => {
          if (!matchesScheduleFilters(event)) return false;
          if (event.allDay) {
            const startKey = event.start.slice(0, 10);
            const endKey = event.end.slice(0, 10);
            return key >= startKey && key < endKey;
          }
          return sameDay(eventStartDate(event), day);
        });
      }

      function populateScheduleProjectFilter() {
        const existing = currentScheduleProjectFilter;
        scheduleProjectFilter.innerHTML = '<option value="All">All Projects</option>';
        teams.forEach(team => {
          const option = document.createElement("option");
          option.value = team;
          option.textContent = team;
          scheduleProjectFilter.appendChild(option);
        });
        scheduleProjectFilter.value = teams.includes(existing) ? existing : "All";
        currentScheduleProjectFilter = scheduleProjectFilter.value;
      }

      function populateScheduleOrgTeamFilter() {
        const existing = currentScheduleOrgTeamFilter;
        scheduleOrgTeamFilter.innerHTML = '<option value="All">All Teams</option>';
        orgTeams.forEach(orgTeam => {
          const option = document.createElement("option");
          option.value = orgTeam;
          option.textContent = orgTeam;
          scheduleOrgTeamFilter.appendChild(option);
        });
        scheduleOrgTeamFilter.value = orgTeams.includes(existing) ? existing : "All";
        currentScheduleOrgTeamFilter = scheduleOrgTeamFilter.value;
      }

      function updateScheduleFilterControls() {
        scheduleClearFiltersBtn.hidden =
          currentScheduleProjectFilter === "All" && currentScheduleOrgTeamFilter === "All";
      }

      function renderScheduleAllDay(days) {
        scheduleAllDay.innerHTML = "";
        const gutter = document.createElement("div");
        gutter.className = "schedule-allday-gutter";
        gutter.textContent = "GMT" + (() => {
          const offset = -new Date().getTimezoneOffset() / 60;
          const sign = offset >= 0 ? "+" : "";
          return `${sign}${offset}`;
        })();
        scheduleAllDay.appendChild(gutter);

        const today = new Date();
        days.forEach(day => {
          const cell = document.createElement("div");
          cell.className = "schedule-day-header" +
            (sameDay(day, today) ? " today" : "") +
            (day.getDay() === 0 ? " weekend" : "");
          cell.innerHTML = `
            <div class="schedule-day-name">${day.toLocaleString("en-US", { weekday: "short" })}</div>
            <div class="schedule-day-number">${day.getDate()}</div>
          `;

          const list = document.createElement("div");
          list.className = "schedule-allday-events";

          eventsForDay(day).filter(event => event.allDay).forEach(event => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "schedule-event-chip";
            chip.style.background = event.color || SCHEDULE_COLORS[0];
            chip.textContent = event.title || "(No title)";
            chip.title = scheduleEventTooltip(event);
            chip.addEventListener("click", e => {
              e.stopPropagation();
              openScheduleModal(event);
            });
            list.appendChild(chip);
          });

          cell.appendChild(list);

          cell.addEventListener("dblclick", () => {
            if (!can("schedule.create")) return;
            const draft = createDraftEvent(day, addDays(day, 1), true);
            openScheduleModal(draft, true);
          });

          scheduleAllDay.appendChild(cell);
        });
      }

      function renderScheduleTimed(days) {
        const gridHeight = SCHEDULE_VISIBLE_HOURS * SCHEDULE_HOUR_HEIGHT;
        scheduleTimed.style.setProperty("--schedule-hour-height", `${SCHEDULE_HOUR_HEIGHT}px`);
        scheduleTimed.style.setProperty("--schedule-hour-count", String(SCHEDULE_VISIBLE_HOURS));
        scheduleTimed.innerHTML = "";

        const gutter = document.createElement("div");
        gutter.className = "schedule-time-gutter";
        gutter.style.height = `${gridHeight}px`;
        for (let i = 0; i < SCHEDULE_VISIBLE_HOURS; i++) {
          const hour = (SCHEDULE_DAY_START_HOUR + i) % 24;
          const label = document.createElement("div");
          label.className = "schedule-hour-label";
          label.style.top = `${i * SCHEDULE_HOUR_HEIGHT}px`;
          label.textContent = formatHourLabel(hour);
          gutter.appendChild(label);
        }
        scheduleTimed.appendChild(gutter);

        const today = new Date();
        days.forEach((day, dayIndex) => {
          const column = document.createElement("div");
          column.className = "schedule-day-column" +
            (sameDay(day, today) ? " today" : "") +
            (day.getDay() === 0 ? " weekend" : "");
          column.style.height = `${gridHeight}px`;
          column.dataset.dayIndex = String(dayIndex);

          if (sameDay(day, today)) {
            const nowMinutes = minutesFromScheduleStart(today);
            if (nowMinutes >= 0 && nowMinutes <= SCHEDULE_VISIBLE_HOURS * 60) {
              const nowLine = document.createElement("div");
              nowLine.className = "schedule-now-line";
              nowLine.style.top = `${(nowMinutes / 60) * SCHEDULE_HOUR_HEIGHT}px`;
              column.appendChild(nowLine);
            }
          }

          const dayLayoutItems = eventsForDay(day)
            .filter(event => !event.allDay)
            .map(event => {
              const start = eventStartDate(event);
              const end = eventEndDate(event);
              return {
                event,
                start,
                end,
                startMinutes: clampScheduleMinutes(minutesFromScheduleStart(start)),
                endMinutes: clampScheduleMinutes(minutesFromScheduleStart(end))
              };
            })
            .filter(item =>
              item.endMinutes > 0 &&
              item.startMinutes < SCHEDULE_VISIBLE_HOURS * 60 &&
              item.endMinutes > item.startMinutes
            );

          layoutOverlappingEvents(dayLayoutItems).forEach(({ event, start, end, startMinutes, endMinutes, col, colCount }) => {
            const top = (startMinutes / 60) * SCHEDULE_HOUR_HEIGHT;
            const height = Math.max(18, ((endMinutes - startMinutes) / 60) * SCHEDULE_HOUR_HEIGHT);
            const colWidth = 100 / colCount;

            const block = document.createElement("button");
            block.type = "button";
            block.className = "schedule-timed-event";
            block.style.top = `${top}px`;
            block.style.height = `${height}px`;
            block.style.left = `calc(${col * colWidth}% + 2px)`;
            block.style.width = `calc(${colWidth}% - 4px)`;
            block.style.background = event.color || SCHEDULE_COLORS[0];
            block.title = scheduleEventTooltip(event);
            block.innerHTML = `
              <span>${escapeHtml(event.title || "(No title)")}</span>
              <span class="schedule-event-time">${escapeHtml(formatEventTime(start))} – ${escapeHtml(formatEventTime(end))}</span>
              <span class="schedule-resize-handle" data-resize="1"></span>
            `;

            block.addEventListener("click", e => {
              e.stopPropagation();
              if (scheduleEventDrag?.moved) return;
              openScheduleModal(event);
            });

            block.addEventListener("pointerdown", e => {
              if (!can("schedule.edit")) return;
              if (e.target.closest("[data-resize]")) {
                e.preventDefault();
                e.stopPropagation();
                scheduleEventDrag = {
                  mode: "resize",
                  eventId: event.id,
                  pointerId: e.pointerId,
                  dayIndex,
                  rect: column.getBoundingClientRect(),
                  startY: e.clientY,
                  moved: false
                };
                block.setPointerCapture(e.pointerId);
                return;
              }

              e.preventDefault();
              e.stopPropagation();
              const rect = column.getBoundingClientRect();
              const dayColumnRects = [...scheduleTimed.querySelectorAll(".schedule-day-column")].map(col => ({
                dayIndex: Number(col.dataset.dayIndex),
                el: col,
                rect: col.getBoundingClientRect()
              }));
              scheduleEventDrag = {
                mode: "move",
                eventId: event.id,
                pointerId: e.pointerId,
                dayIndex,
                durationMs: end.getTime() - start.getTime(),
                moved: false,
                startClientY: e.clientY,
                rect,
                grabOffsetPx: (e.clientY - rect.top) - top,
                dayColumnRects,
                originalLeft: block.style.left,
                originalWidth: block.style.width
              };
              block.style.left = "2px";
              block.style.width = "calc(100% - 4px)";
              block.setPointerCapture(e.pointerId);
            });

            block.addEventListener("pointermove", e => {
              if (!scheduleEventDrag || scheduleEventDrag.eventId !== event.id) return;
              if (e.pointerId !== scheduleEventDrag.pointerId) return;
              const current = getScheduleEventById(event.id);
              if (!current) return;

              if (Math.abs(e.clientY - (scheduleEventDrag.startClientY || scheduleEventDrag.startY || 0)) > 3) {
                scheduleEventDrag.moved = true;
              }

              if (scheduleEventDrag.mode === "move") {
                const dayColumnRects = scheduleEventDrag.dayColumnRects;
                let target = dayColumnRects.find(d => e.clientX >= d.rect.left && e.clientX < d.rect.right);
                if (!target) {
                  target = e.clientX < dayColumnRects[0].rect.left
                    ? dayColumnRects[0]
                    : dayColumnRects[dayColumnRects.length - 1];
                }

                if (target.dayIndex !== scheduleEventDrag.dayIndex) {
                  scheduleEventDrag.dayIndex = target.dayIndex;
                  scheduleEventDrag.rect = target.rect;
                  target.el.appendChild(block);
                }

                const rect = scheduleEventDrag.rect;
                const rawY = (e.clientY - rect.top) - scheduleEventDrag.grabOffsetPx;
                const y = Math.min(rect.height, Math.max(0, rawY));
                const startOffset = clampScheduleMinutes(snapMinutes((y / SCHEDULE_HOUR_HEIGHT) * 60));
                const dayDate = days[scheduleEventDrag.dayIndex];
                const nextStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), SCHEDULE_DAY_START_HOUR, 0, 0, 0);
                nextStart.setMinutes(nextStart.getMinutes() + startOffset);
                const nextEnd = new Date(nextStart.getTime() + scheduleEventDrag.durationMs);
                current.start = toLocalDateTimeValue(nextStart);
                current.end = toLocalDateTimeValue(nextEnd);
                block.style.top = `${(startOffset / 60) * SCHEDULE_HOUR_HEIGHT}px`;
              } else {
                const rect = scheduleEventDrag.rect;
                const y = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
                const minutes = snapMinutes((y / SCHEDULE_HOUR_HEIGHT) * 60);
                const currentStart = eventStartDate(current);
                const startOffset = clampScheduleMinutes(minutesFromScheduleStart(currentStart));
                const endOffset = Math.max(startOffset + 15, clampScheduleMinutes(minutes));
                const dayDate = days[Number(column.dataset.dayIndex)];
                const nextEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), SCHEDULE_DAY_START_HOUR, 0, 0, 0);
                nextEnd.setMinutes(nextEnd.getMinutes() + endOffset);
                current.end = toLocalDateTimeValue(nextEnd);
                block.style.height = `${((endOffset - startOffset) / 60) * SCHEDULE_HOUR_HEIGHT}px`;
              }
            });

            const finishEventDrag = e => {
              if (!scheduleEventDrag || scheduleEventDrag.eventId !== event.id) return;
              if (e.pointerId !== scheduleEventDrag.pointerId) return;
              const { moved, mode, originalLeft, originalWidth } = scheduleEventDrag;
              scheduleEventDrag = null;
              try { block.releasePointerCapture(e.pointerId); } catch (_) {}
              if (moved) {
                saveSchedule();
                renderScheduleView({ preserveScroll: true });
                void trackerSync.syncScheduleEvent(event.id);
              } else if (mode === "move") {
                block.style.left = originalLeft;
                block.style.width = originalWidth;
              }
            };

            block.addEventListener("pointerup", finishEventDrag);
            block.addEventListener("pointercancel", finishEventDrag);

            column.appendChild(block);
          });

          column.addEventListener("pointerdown", e => {
            if (e.target.closest(".schedule-timed-event")) return;
            if (!column.contains(e.target)) return;
            if (!can("schedule.create")) return;
            e.preventDefault();

            const rect = column.getBoundingClientRect();
            const y = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
            const startMinutes = clampScheduleMinutes(snapMinutes((y / SCHEDULE_HOUR_HEIGHT) * 60));

            const selection = document.createElement("div");
            selection.className = "schedule-selection";
            selection.style.top = `${(startMinutes / 60) * SCHEDULE_HOUR_HEIGHT}px`;
            selection.style.height = `${SCHEDULE_HOUR_HEIGHT / 2}px`;
            column.appendChild(selection);

            scheduleDragCreate = {
              pointerId: e.pointerId,
              dayIndex,
              startMinutes,
              endMinutes: Math.min(SCHEDULE_VISIBLE_HOURS * 60, startMinutes + 30),
              selection,
              rect
            };
            column.setPointerCapture(e.pointerId);
          });

          column.addEventListener("pointermove", e => {
            if (!scheduleDragCreate || e.pointerId !== scheduleDragCreate.pointerId) return;
            if (Number(column.dataset.dayIndex) !== scheduleDragCreate.dayIndex) return;
            const rect = scheduleDragCreate.rect;
            const y = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
            const minutes = clampScheduleMinutes(snapMinutes((y / SCHEDULE_HOUR_HEIGHT) * 60));
            const start = Math.min(scheduleDragCreate.startMinutes, minutes);
            const end = Math.max(scheduleDragCreate.startMinutes + 15, minutes);
            scheduleDragCreate.endMinutes = end;
            scheduleDragCreate.selection.style.top = `${(start / 60) * SCHEDULE_HOUR_HEIGHT}px`;
            scheduleDragCreate.selection.style.height = `${((end - start) / 60) * SCHEDULE_HOUR_HEIGHT}px`;
          });

          const finishCreate = e => {
            if (!scheduleDragCreate || e.pointerId !== scheduleDragCreate.pointerId) return;
            if (Number(column.dataset.dayIndex) !== scheduleDragCreate.dayIndex) return;

            const draftState = scheduleDragCreate;
            scheduleDragCreate = null;
            draftState.selection.remove();
            try { column.releasePointerCapture(e.pointerId); } catch (_) {}

            if (e.type !== "pointerup") return;

            const startMinutes = Math.min(draftState.startMinutes, draftState.endMinutes);
            const endMinutes = Math.max(draftState.startMinutes + 30, draftState.endMinutes);
            const dayDate = days[draftState.dayIndex];
            const start = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), SCHEDULE_DAY_START_HOUR, 0, 0, 0);
            start.setMinutes(start.getMinutes() + startMinutes);
            const end = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), SCHEDULE_DAY_START_HOUR, 0, 0, 0);
            end.setMinutes(end.getMinutes() + endMinutes);
            openScheduleModal(createDraftEvent(start, end, false), true);
          };

          column.addEventListener("pointerup", finishCreate);
          column.addEventListener("pointercancel", finishCreate);

          scheduleTimed.appendChild(column);
        });
      }

      function scrollScheduleToWorkingHours() {
        scheduleTimedScroll.scrollTop = 0;
      }

      function renderScheduleView({ preserveScroll = false } = {}) {
        schedule = normalizeSchedule(schedule);
        ensureScheduleWeek();
        populateScheduleProjectFilter();
        populateScheduleOrgTeamFilter();
        updateScheduleFilterControls();
        const days = scheduleWeekDays();
        const previousScroll = scheduleTimedScroll.scrollTop;
        scheduleRangeTitle.textContent = formatWeekRangeTitle(scheduleWeekStart);
        renderScheduleAllDay(days);
        renderScheduleTimed(days);
        if (preserveScroll) scheduleTimedScroll.scrollTop = previousScroll;
        else scrollScheduleToWorkingHours();

        applyPermissionGating();
      }

      function shiftScheduleWeek(deltaWeeks) {
        ensureScheduleWeek();
        scheduleWeekStart = addDays(scheduleWeekStart, deltaWeeks * 7);
        renderScheduleView();
      }

      function jumpScheduleToToday() {
        scheduleWeekStart = startOfWeekMonday(new Date());
        renderScheduleView();
      }

      function renderOrgTeamManager() {
        orgTeamManagerList.innerHTML = "";
        orgTeamManagerList.classList.add("team-table");

        const header = document.createElement("div");
        header.className = "team-table-header org-team-table-header";
        header.innerHTML = `
          <div>Team</div>
          <div>Team Members</div>
          <div>Actions</div>
        `;
        orgTeamManagerList.appendChild(header);

        orgTeams.forEach(orgTeam => {
          const row = document.createElement("div");
          row.className = "team-row org-team-row";

          const nameCell = document.createElement("div");
          nameCell.className = "team-cell team-name-cell";

          const dragHandle = createReorderHandle(`Drag to reorder ${orgTeam}`);

          const input = document.createElement("input");
          input.className = "team-name-input";
          input.value = orgTeam;
          input.setAttribute("aria-label", `Edit team name: ${orgTeam}`);
          input.dataset.permission = "teams.rename";
          input.dataset.permissionMode = "disable";

          nameCell.appendChild(dragHandle);
          nameCell.appendChild(input);

          const memberCell = document.createElement("div");
          memberCell.className = "team-cell team-count-cell";
          memberCell.textContent = String((orgTeamMembers[orgTeam] || []).length);

          const actions = document.createElement("div");
          actions.className = "team-cell team-row-actions";

          const configureBtn = document.createElement("button");
          configureBtn.type = "button";
          configureBtn.className = "project-configure-btn";
          configureBtn.textContent = "Configure";
          configureBtn.dataset.permission = "teams.manageMembers";

          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "save-team-btn project-config-save";
          saveBtn.textContent = "Save";
          saveBtn.hidden = true;

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "danger-btn";
          removeBtn.textContent = "Remove";
          removeBtn.dataset.permission = "teams.delete";

          const membersPanel = document.createElement("div");
          membersPanel.className = "team-members-panel team-members-table-row";
          membersPanel.hidden = true;

          const membersTitle = document.createElement("div");
          membersTitle.className = "team-members-title";
          membersTitle.textContent = `Team members · ${orgTeam}`;
          membersPanel.appendChild(membersTitle);

          const memberOptions = document.createElement("div");
          memberOptions.className = "team-member-options";

          if (!staff.length) {
            const empty = document.createElement("div");
            empty.className = "team-members-empty";
            empty.textContent = "No team members have been added yet.";
            memberOptions.appendChild(empty);
          } else {
            staff.forEach(staffName => {
              const label = document.createElement("label");
              label.className = "team-member-option";

              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.checked = (orgTeamMembers[orgTeam] || []).includes(staffName);
              checkbox.dataset.permission = "teams.manageMembers";
              checkbox.dataset.permissionMode = "disable";

              const otherTeams = orgTeamsForStaff(staffName)
                .filter(teamName => teamName !== orgTeam);
              const profile = staffProfiles[staffName] || { role: "" };
              const suffixParts = [];
              if (profile.role) suffixParts.push(profile.role);
              if (otherTeams.length) suffixParts.push(`also in ${otherTeams.join(", ")}`);

              checkbox.addEventListener("change", () => {
                if (!can("teams.manageMembers")) {
                  checkbox.checked = !checkbox.checked;
                  return;
                }
                if (!orgTeamMembers[orgTeam]) orgTeamMembers[orgTeam] = [];

                if (checkbox.checked) {
                  if (!orgTeamMembers[orgTeam].includes(staffName)) {
                    orgTeamMembers[orgTeam].push(staffName);
                  }
                } else {
                  orgTeamMembers[orgTeam] = (orgTeamMembers[orgTeam] || [])
                    .filter(member => member !== staffName);
                }

                saveOrgTeamMembers();
                settingsSync.scheduleOrgTeamMembersSync(orgTeam);
                memberCell.textContent = String((orgTeamMembers[orgTeam] || []).length);
                render();
              });

              label.appendChild(checkbox);
              label.appendChild(
                document.createTextNode(
                  suffixParts.length ? `${staffName} · ${suffixParts.join(" · ")}` : staffName
                )
              );
              memberOptions.appendChild(label);
            });
          }

          membersPanel.appendChild(memberOptions);

          configureBtn.addEventListener("click", () => {
            if (!can("teams.manageMembers")) return;
            membersPanel.hidden = false;
            configureBtn.hidden = true;
            saveBtn.hidden = false;
          });

          saveBtn.addEventListener("click", async () => {
            const newName = input.value.trim();

            if (!newName) {
              input.value = orgTeam;
              return;
            }

            const duplicate = orgTeams.some(teamName =>
              teamName !== orgTeam && teamName.toLowerCase() === newName.toLowerCase()
            );

            if (duplicate) {
              input.value = orgTeam;
              return;
            }

            if (newName !== orgTeam) {
              if (!can("teams.rename")) return;
              saveBtn.disabled = true;
              try {
                await settingsSync.renameOrgTeam(orgTeam, newName);
              } catch (error) {
                console.error("Rename team failed.", error);
                saveBtn.disabled = false;
                input.value = orgTeam;
                window.alert(error instanceof Error ? error.message : "Could not rename team.");
                return;
              }
              saveBtn.disabled = false;

              orgTeams = orgTeams.map(teamName => teamName === orgTeam ? newName : teamName);
              orgTeamMembers[newName] = [...(orgTeamMembers[orgTeam] || [])];
              delete orgTeamMembers[orgTeam];

              saveOrgTeams();
              saveOrgTeamMembers();

              if (currentOrgTeamFilter === orgTeam) {
                currentOrgTeamFilter = newName;
              }

              populateOrgTeamFilter();
              orgTeamFilter.value = currentOrgTeamFilter;
              renderOrgTeamManager();
              populateStaffFilter();
              populateCurrentUserSelect();
              renderStaffManager();
              render();
              return;
            }

            membersPanel.hidden = true;
            saveBtn.hidden = true;
            configureBtn.hidden = false;

            populateStaffFilter();
            populateCurrentUserSelect();
            renderStaffManager();
            render();
          });

          input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveBtn.click();
            }
          });

          let removeArmed = false;
          let removeResetTimer = null;

          removeBtn.addEventListener("click", async () => {
            if (!can("teams.delete")) return;
            if (!removeArmed) {
              removeArmed = true;
              removeBtn.textContent = "Confirm";
              removeResetTimer = setTimeout(() => {
                removeArmed = false;
                removeBtn.textContent = "Remove";
              }, 6000);
              return;
            }

            if (removeResetTimer) clearTimeout(removeResetTimer);

            removeBtn.disabled = true;
            try {
              await settingsSync.deleteOrgTeam(orgTeam);
            } catch (error) {
              console.error("Delete team failed.", error);
              removeBtn.disabled = false;
              removeArmed = false;
              removeBtn.textContent = "Remove";
              window.alert(error instanceof Error ? error.message : "Could not remove team.");
              return;
            }

            orgTeams = orgTeams.filter(teamName => teamName !== orgTeam);
            delete orgTeamMembers[orgTeam];

            saveOrgTeams();
            saveOrgTeamMembers();

            if (currentOrgTeamFilter === orgTeam) {
              currentOrgTeamFilter = "All";
            }

            populateOrgTeamFilter();
            orgTeamFilter.value = currentOrgTeamFilter;
            renderOrgTeamManager();
            populateStaffFilter();
            populateCurrentUserSelect();
            renderStaffManager();
            render();
          });

          attachRowReorder({
            row,
            handle: dragHandle,
            container: orgTeamManagerList,
            value: orgTeam,
            state: reorderState.orgTeam,
            getList: () => orgTeams,
            onReorder: nextList => {
              orgTeams = nextList;
              saveOrgTeams();
              scheduleFolderSync();
              renderOrgTeamManager();
            }
          });

          actions.appendChild(configureBtn);
          actions.appendChild(saveBtn);
          actions.appendChild(removeBtn);

          row.appendChild(nameCell);
          row.appendChild(memberCell);
          row.appendChild(actions);
          row.appendChild(membersPanel);
          orgTeamManagerList.appendChild(row);
        });

        if (!orgTeams.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No teams yet. Add your first team above.";
          orgTeamManagerList.appendChild(empty);
        }

        applyPermissionGating();
      }

      function addOrgTeam() {
        if (!can("teams.create")) return;
        const name = newOrgTeamName.value.trim();
        if (!name) {
          showFormFeedback(
            [newOrgTeamName],
            orgTeamFormFeedback,
            "Enter a team name."
          );
          return;
        }

        const exists = orgTeams.some(teamName => teamName.toLowerCase() === name.toLowerCase());
        if (exists) {
          showFormFeedback(
            [newOrgTeamName],
            orgTeamFormFeedback,
            `A team named "${name}" already exists.`
          );
          return;
        }

        clearFormFeedback([newOrgTeamName], orgTeamFormFeedback);
        const addBtn = document.getElementById("addOrgTeamBtn");
        if (addBtn) addBtn.disabled = true;

        void settingsSync.createOrgTeam(name)
          .then(body => {
            orgTeams.push(body.name);
            orgTeamMembers[body.name] = [];
            saveOrgTeams();
            saveOrgTeamMembers();
            populateOrgTeamFilter();
            newOrgTeamName.value = "";
            renderOrgTeamManager();
            newOrgTeamName.focus();
          })
          .catch(error => {
            console.error("Create team failed.", error);
            showFormFeedback(
              [newOrgTeamName],
              orgTeamFormFeedback,
              error instanceof Error ? error.message : "Could not create team."
            );
          })
          .finally(() => {
            if (addBtn) addBtn.disabled = false;
          });
      }

      function saveTeams() {
        localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
      }

      function renderTeamManager() {
        if (teamsView.classList.contains("active")) {
          console.log("[project-config]", {
            layer: "ui",
            step: "renderTeamManager",
            note: "full project list rebuild — open configure panels will close",
          });
        }
        teamManagerList.innerHTML = "";
        teamManagerList.classList.add("team-table");

        const header = document.createElement("div");
        header.className = "team-table-header";
        header.innerHTML = `
          <div>Project</div>
          <div>Tasks</div>
          <div>Team Members</div>
          <div>Actions</div>
        `;
        teamManagerList.appendChild(header);

        teams.forEach(team => {
          const count = tasks.filter(t => t.team === team).length;
          const row = document.createElement("div");
          row.className = "team-row";
          row.dataset.projectId = projectIds[team] || "";

          const nameCell = document.createElement("div");
          nameCell.className = "team-cell team-name-cell";

          const dragHandle = createReorderHandle(`Drag to reorder ${team}`);

          const input = document.createElement("input");
          input.className = "team-name-input";
          input.value = team;
          input.setAttribute("aria-label", `Edit project name: ${team}`);
          input.dataset.permission = "projects.rename";
          input.dataset.permissionMode = "disable";

          nameCell.appendChild(dragHandle);
          nameCell.appendChild(input);

          const taskCell = document.createElement("div");
          taskCell.className = "team-cell team-count-cell";
          taskCell.textContent = String(count);

          const memberCell = document.createElement("div");
          memberCell.className = "team-cell team-count-cell";
          const memberCount = (teamMembers[team] || []).length;
          memberCell.textContent = String(memberCount);

          const actions = document.createElement("div");
          actions.className = "team-cell team-row-actions";

          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "save-team-btn project-config-save";
          saveBtn.textContent = "Save";
          saveBtn.hidden = true;
          saveBtn.disabled = true;

          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "btn-secondary project-config-cancel";
          cancelBtn.textContent = "Cancel";
          cancelBtn.hidden = true;

          const membersBtn = document.createElement("button");
          membersBtn.type = "button";
          membersBtn.className = "project-configure-btn";
          membersBtn.textContent = "Configure";
          membersBtn.dataset.permission = "projects.manageMembers";

          const membersPanel = document.createElement("div");
          membersPanel.className = "team-members-panel team-members-table-row";
          membersPanel.hidden = true;

          const rowFeedback = document.createElement("div");
          rowFeedback.className = "form-feedback project-row-feedback";
          rowFeedback.setAttribute("role", "status");
          rowFeedback.setAttribute("aria-live", "polite");

          function clearProjectRowFeedback() {
            rowFeedback.textContent = "";
            rowFeedback.classList.remove("visible");
          }

          function showProjectRowFeedback(message) {
            rowFeedback.textContent = message;
            rowFeedback.classList.add("visible");
          }

          let savedMembers = [...(teamMembers[team] || [])];
          let savedLeader = teamLeaders[team] || "";
          let draftMembers = [...savedMembers];
          let draftLeader = savedLeader;

          function projectMemberListsEqual(a, b) {
            if (a.length !== b.length) return false;
            const setB = new Set(b);
            return a.every(name => setB.has(name));
          }

          function isProjectConfigDirty() {
            return !projectMemberListsEqual(draftMembers, savedMembers) ||
              draftLeader !== savedLeader;
          }

          function updateProjectSaveBtn() {
            saveBtn.disabled = !isProjectConfigDirty();
          }

          function logProjectConfig(step, detail = {}) {
            console.log("[project-config]", {
              layer: "ui",
              project: team,
              projectId: projectIds[team] || null,
              step,
              panelOpen: !membersPanel.hidden,
              dirty: isProjectConfigDirty(),
              draftMembers: [...draftMembers],
              draftLeader,
              savedMembers: [...savedMembers],
              savedLeader,
              ...detail,
            });
          }

          function draftMembersForTeam() {
            return staff.filter(name => draftMembers.includes(name));
          }

          function closeProjectConfigurePanel() {
            logProjectConfig("close-panel");
            membersPanel.hidden = true;
            saveBtn.hidden = true;
            cancelBtn.hidden = true;
            membersBtn.hidden = false;
            clearProjectRowFeedback();
          }

          saveBtn.addEventListener("click", async () => {
            const newName = input.value.trim();

            if (!newName) {
              input.value = team;
              return;
            }

            const duplicate = teams.some(t =>
              t !== team && t.toLowerCase() === newName.toLowerCase()
            );

            if (duplicate) {
              input.value = team;
              return;
            }

            if (newName !== team) {
              if (!can("projects.rename")) return;
              saveBtn.disabled = true;
              try {
                await settingsSync.renameProject(team, newName);
              } catch (error) {
                console.error("Rename project failed.", error);
                saveBtn.disabled = false;
                input.value = team;
                window.alert(error instanceof Error ? error.message : "Could not rename project.");
                return;
              }
              saveBtn.disabled = false;

              teams = teams.map(t => t === team ? newName : t);
              tasks = tasks.map(task =>
                task.team === team ? { ...task, team: newName } : task
              );

              schedule.events = schedule.events.map(evt =>
                evt.project === team ? { ...evt, project: newName } : evt
              );

              teamMembers[newName] = [...(teamMembers[team] || [])];
              delete teamMembers[team];

              teamLeaders[newName] = teamLeaders[team] || "";
              delete teamLeaders[team];

              if (currentFilter === team) {
                currentFilter = newName;
              }

              if (currentScheduleProjectFilter === team) {
                currentScheduleProjectFilter = newName;
              }

              saveTeams();
              saveTeamMembers();
              saveTeamLeaders();
              saveSchedule();
              save(tasks.filter(task => task.team === newName).map(task => task.id));
              populateTeamFilter();
              renderTeamManager();
              renderScheduleView();
              render();
              return;
            }

            if (!membersPanel.hidden) {
              if (!isProjectConfigDirty()) {
                logProjectConfig("save-click-ignored", { reason: "not-dirty" });
                return;
              }

              logProjectConfig("save-click-start");
              clearProjectRowFeedback();
              saveBtn.disabled = true;
              saveBtn.textContent = "Saving…";
              try {
                teamMembers[team] = [...draftMembers];
                teamLeaders[team] = draftLeader;
                saveTeamMembers();
                saveTeamLeaders();
                logProjectConfig("save-local-state-committed");
                await settingsSync.flushProjectConfigSync(team);
                savedMembers = [...draftMembers];
                savedLeader = draftLeader;
                memberCell.textContent = String(draftMembers.length);
                logProjectConfig("save-success");
              } catch (error) {
                console.error("[project-config] save failed", { project: team, error });
                teamMembers[team] = [...savedMembers];
                teamLeaders[team] = savedLeader;
                saveTeamMembers();
                saveTeamLeaders();
                logProjectConfig("save-error-reverted-local-state", {
                  error: error instanceof Error ? error.message : String(error),
                });
                const message = error instanceof Error
                  ? error.message
                  : "Could not save project.";
                saveBtn.textContent = "Save";
                updateProjectSaveBtn();
                showProjectRowFeedback(message);
                setBackupStatus(message, true);
                return;
              }
              saveBtn.textContent = "Save";
              closeProjectConfigurePanel();
              logProjectConfig("save-complete-before-render");
              populateStaffFilter();
              populateTeamFilter();
              render();
              logProjectConfig("save-complete-after-render");
              return;
            }
          });

          input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveBtn.click();
            }
          });

          const membersTitle = document.createElement("div");
          membersTitle.className = "team-members-title";
          membersTitle.textContent = `Project members · ${team}`;
          membersPanel.appendChild(membersTitle);

          const memberOptions = document.createElement("div");
          memberOptions.className = "team-member-options";

          if (!staff.length) {
            const emptyMembers = document.createElement("div");
            emptyMembers.className = "team-members-empty";
            emptyMembers.textContent = "No team members have been added yet.";
            memberOptions.appendChild(emptyMembers);
          } else {
            memberOptions.classList.add("project-member-groups");

            const syncDepartmentSelectAll = (groupSection) => {
              const selectAll = groupSection.querySelector(
                'input[type="checkbox"][data-department-select-all]'
              );
              if (!selectAll) return;

              const memberChecks = [
                ...groupSection.querySelectorAll('input[type="checkbox"][data-staff-name]'),
              ];
              const checkedCount = memberChecks.filter(box => box.checked).length;
              selectAll.checked = memberChecks.length > 0 && checkedCount === memberChecks.length;
              selectAll.indeterminate =
                checkedCount > 0 && checkedCount < memberChecks.length;
            };

            const appendProjectMemberOption = (staffName, memberList, groupSection) => {
              const label = document.createElement("label");
              label.className = "team-member-option";

              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.dataset.staffName = staffName;
              checkbox.checked = draftMembers.includes(staffName);
              checkbox.dataset.permission = "projects.manageMembers";
              checkbox.dataset.permissionMode = "disable";

              checkbox.addEventListener("change", () => {
                if (!can("projects.manageMembers")) {
                  checkbox.checked = !checkbox.checked;
                  return;
                }
                clearProjectRowFeedback();

                if (checkbox.checked) {
                  if (!draftMembers.includes(staffName)) {
                    draftMembers.push(staffName);
                  }
                } else {
                  draftMembers = draftMembers.filter(member => member !== staffName);
                  if (draftLeader === staffName) {
                    draftLeader = "";
                  }
                }

                syncDepartmentSelectAll(groupSection);
                refreshLeaderOptions();
                logProjectConfig("member-toggle", {
                  staffName,
                  checked: checkbox.checked,
                });
              });

              const profile = staffProfiles[staffName] || { role: "" };
              const memberText = profile.role
                ? `${staffName} · ${profile.role}`
                : staffName;

              label.appendChild(checkbox);
              label.appendChild(document.createTextNode(memberText));
              memberList.appendChild(label);
            };

            // Group project candidates by Workforce department so long lists
            // are easier to scan when assigning members after create.
            const departmentGroups = new Map();
            staff.forEach(staffName => {
              const department = String(staffProfiles[staffName]?.department || "").trim();
              const groupName = department || "No department";
              if (!departmentGroups.has(groupName)) {
                departmentGroups.set(groupName, []);
              }
              departmentGroups.get(groupName).push(staffName);
            });

            const groupedStaff = [...departmentGroups.entries()]
              .map(([name, members]) => ({
                name,
                members: [...members].sort((a, b) => a.localeCompare(b)),
              }))
              .sort((a, b) => {
                if (a.name === "No department") return 1;
                if (b.name === "No department") return -1;
                return a.name.localeCompare(b.name);
              });

            groupedStaff.forEach(group => {
              const groupSection = document.createElement("section");
              groupSection.className = "project-member-group is-collapsed";

              const groupHeader = document.createElement("div");
              groupHeader.className = "project-member-group-header";

              const selectAllLabel = document.createElement("label");
              selectAllLabel.className = "project-member-group-select-all";
              selectAllLabel.title = `Select all in ${group.name}`;

              const selectAll = document.createElement("input");
              selectAll.type = "checkbox";
              selectAll.dataset.departmentSelectAll = "true";
              selectAll.dataset.permission = "projects.manageMembers";
              selectAll.dataset.permissionMode = "disable";
              selectAll.setAttribute("aria-label", `Select all ${group.name}`);

              selectAll.addEventListener("change", () => {
                if (!can("projects.manageMembers")) {
                  selectAll.checked = !selectAll.checked;
                  selectAll.indeterminate = false;
                  return;
                }
                clearProjectRowFeedback();

                const shouldSelect = selectAll.checked;
                group.members.forEach(staffName => {
                  if (shouldSelect) {
                    if (!draftMembers.includes(staffName)) {
                      draftMembers.push(staffName);
                    }
                  } else {
                    draftMembers = draftMembers.filter(member => member !== staffName);
                    if (draftLeader === staffName) {
                      draftLeader = "";
                    }
                  }
                });

                groupSection
                  .querySelectorAll('input[type="checkbox"][data-staff-name]')
                  .forEach(box => {
                    box.checked = shouldSelect;
                  });
                selectAll.indeterminate = false;
                refreshLeaderOptions();
                logProjectConfig("department-select-all", {
                  department: group.name,
                  checked: shouldSelect,
                  count: group.members.length,
                });
              });

              const selectAllText = document.createElement("span");
              selectAllText.textContent = "All";

              selectAllLabel.appendChild(selectAll);
              selectAllLabel.appendChild(selectAllText);

              const toggleBtn = document.createElement("button");
              toggleBtn.type = "button";
              toggleBtn.className = "project-member-group-toggle";
              toggleBtn.setAttribute("aria-expanded", "false");
              toggleBtn.title = `Show ${group.name}`;

              const groupTitle = document.createElement("span");
              groupTitle.className = "project-member-group-title";
              groupTitle.textContent = group.name;

              const groupCount = document.createElement("span");
              groupCount.className = "project-member-group-count";
              groupCount.textContent = String(group.members.length);

              const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
              chevron.setAttribute("class", "project-member-group-chevron");
              chevron.setAttribute("viewBox", "0 0 24 24");
              chevron.setAttribute("aria-hidden", "true");
              const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
              chevronPath.setAttribute("d", "M6 9.5 12 15l6-5.5");
              chevronPath.setAttribute("fill", "none");
              chevronPath.setAttribute("stroke", "currentColor");
              chevronPath.setAttribute("stroke-width", "2");
              chevronPath.setAttribute("stroke-linecap", "round");
              chevronPath.setAttribute("stroke-linejoin", "round");
              chevron.appendChild(chevronPath);

              toggleBtn.appendChild(groupTitle);
              toggleBtn.appendChild(groupCount);
              toggleBtn.appendChild(chevron);

              groupHeader.appendChild(selectAllLabel);
              groupHeader.appendChild(toggleBtn);

              const memberList = document.createElement("div");
              memberList.className = "project-member-group-list";
              memberList.hidden = true;

              group.members.forEach(staffName => {
                appendProjectMemberOption(staffName, memberList, groupSection);
              });

              toggleBtn.addEventListener("click", () => {
                const willExpand = groupSection.classList.contains("is-collapsed");
                groupSection.classList.toggle("is-collapsed", !willExpand);
                memberList.hidden = !willExpand;
                toggleBtn.setAttribute("aria-expanded", willExpand ? "true" : "false");
                toggleBtn.title = willExpand
                  ? `Hide ${group.name}`
                  : `Show ${group.name}`;
              });

              groupSection.appendChild(groupHeader);
              groupSection.appendChild(memberList);
              memberOptions.appendChild(groupSection);
              syncDepartmentSelectAll(groupSection);
            });
          }

          membersPanel.appendChild(memberOptions);

          const leaderRow = document.createElement("div");
          leaderRow.className = "team-leader-row";

          const leaderLabel = document.createElement("label");
          leaderLabel.className = "team-leader-label";
          leaderLabel.textContent = "Project Leader";

          const leaderSelect = document.createElement("select");
          leaderSelect.className = "team-leader-select";
          leaderSelect.dataset.permission = "projects.manageMembers";
          leaderSelect.dataset.permissionMode = "disable";

          function refreshLeaderOptions() {
            const members = draftMembersForTeam();

            leaderSelect.innerHTML = '<option value="">No project leader</option>';

            members.forEach(memberName => {
              const option = document.createElement("option");
              option.value = memberName;
              option.textContent = staffTypeLabel(memberName);
              leaderSelect.appendChild(option);
            });

            if (draftLeader && !members.includes(draftLeader)) {
              draftLeader = "";
            }
            leaderSelect.value = draftLeader;
            updateProjectSaveBtn();
          }

          function syncProjectConfigureControlsFromDraft() {
            memberOptions.querySelectorAll('input[type="checkbox"][data-staff-name]').forEach(checkbox => {
              checkbox.checked = draftMembers.includes(checkbox.dataset.staffName);
            });
            memberOptions.querySelectorAll(".project-member-group").forEach(groupSection => {
              const selectAll = groupSection.querySelector(
                'input[type="checkbox"][data-department-select-all]'
              );
              if (!selectAll) return;
              const memberChecks = [
                ...groupSection.querySelectorAll('input[type="checkbox"][data-staff-name]'),
              ];
              const checkedCount = memberChecks.filter(box => box.checked).length;
              selectAll.checked = memberChecks.length > 0 && checkedCount === memberChecks.length;
              selectAll.indeterminate =
                checkedCount > 0 && checkedCount < memberChecks.length;
            });
            refreshLeaderOptions();
          }

          function openProjectConfigurePanel() {
            savedMembers = [...(teamMembers[team] || [])];
            savedLeader = teamLeaders[team] || "";
            draftMembers = [...savedMembers];
            draftLeader = savedLeader;
            syncProjectConfigureControlsFromDraft();
            clearProjectRowFeedback();
            membersPanel.hidden = false;
            membersBtn.hidden = true;
            saveBtn.hidden = false;
            cancelBtn.hidden = false;
            updateProjectSaveBtn();
            logProjectConfig("open-panel");
          }

          refreshLeaderOptions();

          leaderSelect.addEventListener("change", () => {
            if (!can("projects.manageMembers")) return;
            clearProjectRowFeedback();
            const selectedLeader = leaderSelect.value;

            draftLeader = selectedLeader && draftMembers.includes(selectedLeader)
              ? selectedLeader
              : "";

            updateProjectSaveBtn();
            logProjectConfig("leader-change", { selectedLeader: draftLeader });
          });

          leaderRow.appendChild(leaderLabel);
          leaderRow.appendChild(leaderSelect);
          membersPanel.appendChild(leaderRow);
          membersPanel.appendChild(rowFeedback);

          membersBtn.addEventListener("click", () => {
            if (!can("projects.manageMembers")) return;
            openProjectConfigurePanel();
          });

          cancelBtn.addEventListener("click", () => {
            logProjectConfig("cancel-click");
            draftMembers = [...savedMembers];
            draftLeader = savedLeader;
            syncProjectConfigureControlsFromDraft();
            closeProjectConfigurePanel();
          });

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "danger-btn";
          removeBtn.textContent = "Remove";
          removeBtn.dataset.permission = "projects.delete";

          let removeArmed = false;
          let removeResetTimer = null;

          removeBtn.addEventListener("click", async () => {
            if (!can("projects.delete")) return;
            const assignedTasks = tasks.filter(t => t.team === team);

            if (!removeArmed) {
              removeArmed = true;
              removeBtn.textContent = assignedTasks.length > 0
                ? `Confirm · move ${assignedTasks.length}`
                : "Confirm";

              removeResetTimer = setTimeout(() => {
                removeArmed = false;
                removeBtn.textContent = "Remove";
              }, 6000);

              return;
            }

            if (removeResetTimer) clearTimeout(removeResetTimer);

            if (assignedTasks.length > 0) {
              if (team === "Unassigned") {
                removeArmed = false;
                removeBtn.textContent = "Move tasks first";

                setTimeout(() => {
                  removeBtn.textContent = "Remove";
                }, 3000);
                return;
              }

              if (!teams.includes("Unassigned")) {
                teams.push("Unassigned");
                teamMembers["Unassigned"] = teamMembers["Unassigned"] || [];
                teamLeaders["Unassigned"] = teamLeaders["Unassigned"] || "";
              }

              if (!projectIds["Unassigned"]) {
                try {
                  const unassigned = await settingsSync.createProject("Unassigned");
                  projectIds[unassigned.name] = unassigned.id;
                } catch (error) {
                  console.error("Could not ensure Unassigned project.", error);
                }
              }

              tasks = tasks.map(task =>
                task.team === team ? { ...task, team: "Unassigned" } : task
              );
            }

            removeBtn.disabled = true;
            try {
              if (assignedTasks.length > 0) {
                save(assignedTasks.map(task => task.id));
                await new Promise(resolve => setTimeout(resolve, 400));
              }
              await settingsSync.deleteProject(team);
            } catch (error) {
              console.error("Delete project failed.", error);
              removeBtn.disabled = false;
              removeArmed = false;
              removeBtn.textContent = "Remove";
              window.alert(error instanceof Error ? error.message : "Could not remove project.");
              return;
            }

            teams = teams.filter(t => t !== team);
            teams = [...new Set(teams)];
            delete teamMembers[team];
            delete teamLeaders[team];

            schedule.events = schedule.events.map(evt =>
              evt.project === team ? { ...evt, project: "" } : evt
            );

            if (currentFilter === team) {
              currentFilter = "All";
            }

            if (currentScheduleProjectFilter === team) {
              currentScheduleProjectFilter = "All";
            }

            saveTeams();
            saveTeamMembers();
            saveTeamLeaders();
            saveSchedule();
            save();
            populateTeamFilter();
            teamFilter.value = currentFilter;
            renderTeamManager();
            renderScheduleView();
            render();
          });

          attachRowReorder({
            row,
            handle: dragHandle,
            container: teamManagerList,
            value: team,
            state: reorderState.project,
            getList: () => teams,
            onReorder: nextList => {
              teams = nextList;
              saveTeams();
              scheduleFolderSync();
              populateTeamFilter();
              renderTeamManager();
              render();
            }
          });

          actions.appendChild(saveBtn);
          actions.appendChild(cancelBtn);
          actions.appendChild(membersBtn);
          actions.appendChild(removeBtn);

          row.appendChild(nameCell);
          row.appendChild(taskCell);
          row.appendChild(memberCell);
          row.appendChild(actions);
          row.appendChild(membersPanel);
          teamManagerList.appendChild(row);
        });

        if (!teams.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No projects yet. Add your first project above.";
          teamManagerList.appendChild(empty);
        }

        applyPermissionGating();
      }

      function addTeam() {
        if (!can("projects.create")) return;
        const name = newTeamName.value.trim();
        if (!name) {
          showFormFeedback(
            [newTeamName],
            projectFormFeedback,
            "Enter a project name."
          );
          return;
        }

        const exists = teams.some(t => t.toLowerCase() === name.toLowerCase());
        if (exists) {
          showFormFeedback(
            [newTeamName],
            projectFormFeedback,
            `A project named "${name}" already exists.`
          );
          return;
        }

        clearFormFeedback([newTeamName], projectFormFeedback);
        const addBtn = document.getElementById("addTeamBtn");
        if (addBtn) addBtn.disabled = true;

        void settingsSync.createProject(name)
          .then(body => {
            teams.push(body.name);
            teamMembers[body.name] = [];
            teamLeaders[body.name] = "";
            saveTeams();
            saveTeamMembers();
            saveTeamLeaders();
            newTeamName.value = "";
            populateTeamFilter();
            renderTeamManager();
          })
          .catch(error => {
            console.error("Create project failed.", error);
            showFormFeedback(
              [newTeamName],
              projectFormFeedback,
              error instanceof Error ? error.message : "Could not create project."
            );
          })
          .finally(() => {
            if (addBtn) addBtn.disabled = false;
          });
      }

      function populateOrgTeamFilter() {
        const existing = currentOrgTeamFilter;

        orgTeamFilter.innerHTML = '<option value="All">All Teams</option>';

        orgTeams.forEach(orgTeam => {
          const option = document.createElement("option");
          option.value = orgTeam;
          option.textContent = orgTeam;
          orgTeamFilter.appendChild(option);
        });

        orgTeamFilter.value = orgTeams.includes(existing) ? existing : "All";
        currentOrgTeamFilter = orgTeamFilter.value;
      }

      function populateStaffFilter() {
        const existing = currentStaffFilter;

        staffFilter.innerHTML = '<option value="All">All Team Members</option>';

        staff.forEach(name => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = staffTypeLabel(name);
          staffFilter.appendChild(option);
        });

        staffFilter.value = staff.includes(existing) ? existing : "All";
        currentStaffFilter = staffFilter.value;
      }

      function populateCurrentUserSelect() {
        renderAuthenticatedUser();
      }

      function renderAuthenticatedUser() {
        const name = getCurrentUser()?.name || currentUserName || "Unknown";
        const display = document.getElementById("currentUserDisplay");
        if (display) {
          display.textContent = name;
        }
        const toggleName = document.getElementById("sidebarFooterToggleName");
        if (toggleName) {
          toggleName.textContent = name;
        }
      }

      function setupAuthenticatedUserUi() {
        const userBlock = document.querySelector(".sidebar-current-user");
        if (!userBlock || !currentUserSelect) return;

        const display = document.createElement("strong");
        display.id = "currentUserDisplay";
        display.className = "sidebar-current-user-name";
        currentUserSelect.replaceWith(display);

        if (document.getElementById("logoutBtn")) return;

        const logoutBtn = document.createElement("button");
        logoutBtn.type = "button";
        logoutBtn.id = "logoutBtn";
        logoutBtn.className = "sidebar-data-btn sidebar-logout-btn";
        logoutBtn.innerHTML = `
          <svg class="sidebar-data-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 17l5-5-5-5"></path>
            <path d="M15 12H4"></path>
            <path d="M20 4v16"></path>
          </svg>
          <span>Sign out</span>
        `;
        userBlock.appendChild(logoutBtn);

        logoutBtn.addEventListener("click", async () => {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } finally {
            window.location.href = "/login";
          }
        });

        renderAuthenticatedUser();
      }

      function onCurrentUserChanged() {
        updateSidebarBrandMark();
        applyPermissionGating();
        renderAuthenticatedUser();
      }

      function filteredTasks() {
        return tasks.filter(task => {
          const matchesProject =
            currentFilter === "All" || task.team === currentFilter;

          const noOwnerFilters =
            currentOrgTeamFilter === "All" && currentStaffFilter === "All";

          const matchesOwnerFilters =
            noOwnerFilters ||
            taskOwners(task).some(ownerName => {
              const matchesOrgTeam =
                currentOrgTeamFilter === "All" ||
                orgTeamsForStaff(ownerName).includes(currentOrgTeamFilter);

              const matchesStaff =
                currentStaffFilter === "All" ||
                ownerName === currentStaffFilter;

              return matchesOrgTeam && matchesStaff;
            });

          return matchesProject && matchesOwnerFilters;
        });
      }

      function updateFilterControls() {
        clearFiltersBtn.hidden =
          currentFilter === "All" &&
          currentOrgTeamFilter === "All" &&
          currentStaffFilter === "All";
      }

      function clearTaskDropIndicators() {
        document.querySelectorAll(".task.task-drop-before, .task.task-drop-after").forEach(card => {
          card.classList.remove("task-drop-before", "task-drop-after");
        });
        document.querySelectorAll(".task-list.task-list-dragover").forEach(list => {
          list.classList.remove("task-list-dragover");
        });
      }

      function moveTaskRelative(draggedId, targetId, targetStatus, placeAfter) {
        if (!draggedId || !targetId || draggedId === targetId) return;

        const draggedIndex = tasks.findIndex(task => task.id === draggedId);
        if (draggedIndex < 0) return;

        const [draggedTask] = tasks.splice(draggedIndex, 1);
        draggedTask.status = targetStatus;

        const targetIndex = tasks.findIndex(task => task.id === targetId);
        if (targetIndex < 0) {
          tasks.push(draggedTask);
          return;
        }

        tasks.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedTask);
      }

      function moveTaskToColumnEnd(draggedId, targetStatus, visibleTargetIds = []) {
        if (!draggedId) return;

        const draggedIndex = tasks.findIndex(task => task.id === draggedId);
        if (draggedIndex < 0) return;

        const [draggedTask] = tasks.splice(draggedIndex, 1);
        draggedTask.status = targetStatus;

        const targetIds = visibleTargetIds.filter(id => id !== draggedId);
        const lastVisibleId = targetIds[targetIds.length - 1];

        if (lastVisibleId) {
          const lastVisibleIndex = tasks.findIndex(task => task.id === lastVisibleId);
          if (lastVisibleIndex >= 0) {
            tasks.splice(lastVisibleIndex + 1, 0, draggedTask);
            return;
          }
        }

        tasks.push(draggedTask);
      }

      function populateTeamFilter() {
        const existing = currentFilter;

        teamFilter.innerHTML = '<option value="All">All Projects</option>';
        teams.forEach(team => {
          const option = document.createElement("option");
          option.value = team;
          option.textContent = team;
          teamFilter.appendChild(option);
        });

        teamFilter.value = teams.includes(existing) ? existing : "All";
        currentFilter = teamFilter.value;
      }

      function closeAddTaskProjectModal() {
        if (!addTaskProjectModalBackdrop) return;
        addTaskProjectModalBackdrop.hidden = true;
        if (addTaskProjectFeedback) {
          addTaskProjectFeedback.classList.remove("visible");
          addTaskProjectFeedback.textContent = "";
        }
      }

      function openAddTaskProjectModal(status) {
        if (!addTaskProjectModalBackdrop || !addTaskProjectSelect) return;
        if (!can("tasks.create")) return;

        pendingAddTaskStatus = status || "To Do";
        addTaskProjectSelect.innerHTML = "";

        if (!teams.length) {
          const emptyOption = document.createElement("option");
          emptyOption.value = "";
          emptyOption.textContent = "No projects yet";
          addTaskProjectSelect.appendChild(emptyOption);
          if (addTaskProjectFeedback) {
            addTaskProjectFeedback.textContent = "Create a project first, then add tasks.";
            addTaskProjectFeedback.classList.add("visible");
          }
          if (addTaskProjectContinueBtn) addTaskProjectContinueBtn.disabled = true;
        } else {
          teams.forEach(team => {
            const option = document.createElement("option");
            option.value = team;
            option.textContent = team;
            addTaskProjectSelect.appendChild(option);
          });
          if (addTaskProjectFeedback) {
            addTaskProjectFeedback.textContent = "";
            addTaskProjectFeedback.classList.remove("visible");
          }
          if (addTaskProjectContinueBtn) addTaskProjectContinueBtn.disabled = false;
        }

        addTaskProjectModalBackdrop.hidden = false;
        requestAnimationFrame(() => addTaskProjectSelect.focus());
      }

      function confirmAddTaskProjectModal() {
        const projectName = String(addTaskProjectSelect?.value || "").trim();
        if (!projectName || !teams.includes(projectName)) {
          if (addTaskProjectFeedback) {
            addTaskProjectFeedback.textContent = "Choose a project to continue.";
            addTaskProjectFeedback.classList.add("visible");
          }
          return;
        }

        const statusToOpen = pendingAddTaskStatus || "To Do";
        currentFilter = projectName;
        teamFilter.value = projectName;
        currentOrgTeamFilter = "All";
        orgTeamFilter.value = "All";
        pendingAddTaskStatus = statusToOpen;
        closeAddTaskProjectModal();
        render();
      }

      function priorityClass(priority) {
        return "priority-" + priority.toLowerCase();
      }

      function formatDue(date) {
        if (!date) return "Due: No due date";

        const due = new Date(date + "T00:00:00");
        if (Number.isNaN(due.getTime())) return "Due: No due date";

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Use Monday-Sunday as the workweek.
        const mondayOffset = (today.getDay() + 6) % 7;
        const thisWeekStart = new Date(today);
        thisWeekStart.setDate(today.getDate() - mondayOffset);

        const nextWeekStart = new Date(thisWeekStart);
        nextWeekStart.setDate(thisWeekStart.getDate() + 7);

        const weekAfterNextStart = new Date(thisWeekStart);
        weekAfterNextStart.setDate(thisWeekStart.getDate() + 14);

        const weekday = due.toLocaleDateString(undefined, { weekday: "long" });
        const day = due.toLocaleDateString(undefined, { day: "numeric" });
        const month = due.toLocaleDateString(undefined, { month: "long" });

        if (due >= thisWeekStart && due < nextWeekStart) {
          return `Due: ${weekday} this Week`;
        }

        if (due >= nextWeekStart && due < weekAfterNextStart) {
          return `Due: ${weekday} next Week`;
        }

        return `Due: ${day} ${month}`;
      }

      function escapeHtml(value = "") {
        return value.replace(/[&<>"']/g, char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[char]);
      }

      function ensureTaskUpdates(task) {
        if (!Array.isArray(task.updates)) task.updates = [];
        return task.updates;
      }

      function isTodayTimestamp(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return false;

        const now = new Date();
        return d.getFullYear() === now.getFullYear()
          && d.getMonth() === now.getMonth()
          && d.getDate() === now.getDate();
      }

      function hoursAgoLabel(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";

        const diffMs = Math.max(0, Date.now() - d.getTime());
        const hours = Math.floor(diffMs / (1000 * 60 * 60));

        if (hours === 0) return "less than 1 hour ago";
        if (hours === 1) return "1 hour ago";
        return `${hours} hours ago`;
      }

      function formatUpdateTimestamp(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";

        return d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        });
      }

      function updatesHtml(task) {
        const updates = ensureTaskUpdates(task);
        if (!updates.length) {
          return '<div class="task-update-history"><div class="task-update-item"><span class="task-update-bullet" aria-hidden="true"></span><div class="task-update-copy">No updates yet.</div></div></div>';
        }

        const sortedUpdates = [...updates].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );

        return `
          <div class="task-update-history">
            ${sortedUpdates.map(update => {
              const wasUpdatedToday = isTodayTimestamp(update.createdAt);
              const timestampHtml = wasUpdatedToday
                ? `<span class="task-update-time task-update-today">Updated Today · ${escapeHtml(hoursAgoLabel(update.createdAt))}</span>`
                : `<span class="task-update-time">${escapeHtml(formatUpdateTimestamp(update.createdAt))}</span>`;

              return `
                <div class="task-update-item">
                  <span class="task-update-bullet" aria-hidden="true"></span>
                  <div class="task-update-copy">
                    ${escapeHtml(update.text || "")}
                    ${timestampHtml}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      function displayStatusLabel(status) {
        return status === "Done" ? "Completed" : status;
      }

      function celebrateTaskCompletion(taskId) {
        const card = document.querySelector(`.task[data-id="${taskId}"]`);
        if (!card) return;

        card.querySelectorAll(".task-complete-celebration").forEach(el => el.remove());

        const overlay = document.createElement("div");
        overlay.className = "task-complete-celebration";
        overlay.innerHTML = `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M7.5 12.5l3 3 6-6.5"></path>
          </svg>
        `;
        overlay.addEventListener("animationend", e => {
          if (e.target === overlay) overlay.remove();
        });
        card.appendChild(overlay);
        // Backstop in case animationend doesn't fire (e.g. the tab was
        // backgrounded mid-animation) so the overlay never lingers forever.
        setTimeout(() => overlay.remove(), 1400);
      }

      function dedupeTasksById() {
        const seen = new Set();
        const next = [];
        for (const task of tasks) {
          if (!task?.id || seen.has(task.id)) continue;
          seen.add(task.id);
          next.push(task);
        }
        if (next.length !== tasks.length) {
          tasks = next;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        }
      }

      function render() {
        dedupeTasksById();
        board.innerHTML = "";
        updateFilterControls();
        const visible = filteredTasks();

        statuses.forEach(status => {
          const column = document.createElement("section");
          column.className = "column";
          column.dataset.status = status;

          const inColumn = visible.filter(t => t.status === status);

          const statusKey = status.replace(/\s+/g, "-").toLowerCase();

          column.innerHTML = `
            <div class="column-header">
              <div class="column-title-wrap">
                <div class="column-title">${displayStatusLabel(status)}</div>
                <button
                  type="button"
                  class="column-add-btn"
                  data-permission="tasks.create"
                  data-permission-mode="disable"
                  title="${currentFilter === "All" ? "Add task — choose a project" : "Add task to " + status}"
                >+ Add</button>
              </div>
              <div class="count">${inColumn.length}</div>
            </div>

            <div class="inline-editor" data-editor-status="${status}">
              <div class="inline-editor-inner">
                <div class="inline-editor-panel">
                  <div class="inline-editor-title">New task · ${displayStatusLabel(status)}</div>
                  <input type="hidden" class="inline-task-id">

                  <div class="inline-editor-grid">
                    <div class="full">
                      <label for="${statusKey}-title">Task Title</label>
                      <input id="${statusKey}-title" class="inline-title" placeholder="e.g. Prepare monthly report">
                    </div>

                    <div class="full">
                      <label for="${statusKey}-description">Description <span class="optional-label">(optional)</span></label>
                      <textarea id="${statusKey}-description" class="inline-description" placeholder="Add context, expectations, or relevant details"></textarea>
                    </div>

                    <div>
                      <label>Owners</label>
                      <details class="inline-owner owner-checklist">
                        ${ownerChecklistInnerHtml(currentFilter, [])}
                      </details>
                    </div>

                    <div>
                      <label for="${statusKey}-priority">Priority</label>
                      <select id="${statusKey}-priority" class="inline-priority">
                        <option selected>Low</option>
                        <option>High</option>
                      </select>
                    </div>

                    <div class="full">
                      <label for="${statusKey}-due">Due Date</label>
                      <input id="${statusKey}-due" class="inline-due" type="date">
                    </div>
                  </div>

                  <div class="inline-editor-actions">
                    <button type="button" class="btn-secondary inline-cancel">Cancel</button>
                    <button type="button" class="btn-primary inline-save">Add Task</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="task-list" data-status="${status}"></div>
          `;

          const list = column.querySelector(".task-list");
          const addBtn = column.querySelector(".column-add-btn");
          const editor = column.querySelector(".inline-editor");
          const editorTitle = column.querySelector(".inline-editor-title");
          const idInput = column.querySelector(".inline-task-id");
          const titleInput = column.querySelector(".inline-title");
          const descriptionInput = column.querySelector(".inline-description");
          const ownerInput = column.querySelector(".inline-owner");
          bindOwnerChecklist(ownerInput);
          const priorityInput = column.querySelector(".inline-priority");
          const dueInput = column.querySelector(".inline-due");
          const saveInlineBtn = column.querySelector(".inline-save");
          const cancelInlineBtn = column.querySelector(".inline-cancel");

          function resetInlineEditor() {
            idInput.value = "";
            titleInput.value = "";
            descriptionInput.value = "";
            setOwnerChecklist(ownerInput, currentFilter, []);
            priorityInput.value = "Low";
            dueInput.value = "";
            editorTitle.textContent = `New task · ${status}`;
          }

          function openInlineEditor(task = null) {
            if (currentFilter === "All" && !task) {
              openAddTaskProjectModal(status);
              return;
            }

            if (task) {
              idInput.value = task.id;
              titleInput.value = task.title || "";
              descriptionInput.value = task.description || "";
              setOwnerChecklist(ownerInput, task.team || currentFilter, taskOwners(task));
              priorityInput.value = task.priority === "High" ? "High" : "Low";
              dueInput.value = task.due || "";
              editorTitle.textContent = `Edit task · ${status}`;
            } else {
              resetInlineEditor();
            }

            editor.classList.add("open");
            requestAnimationFrame(() => titleInput.focus());
          }

          function closeInlineEditor() {
            editor.classList.remove("open");
            setTimeout(resetInlineEditor, 220);
          }

          addBtn.addEventListener("click", () => {
            if (!can("tasks.create")) return;
            if (editor.classList.contains("open") && !idInput.value) {
              closeInlineEditor();
            } else {
              openInlineEditor();
            }
          });

          if (pendingAddTaskStatus === status && currentFilter !== "All") {
            pendingAddTaskStatus = "";
            requestAnimationFrame(() => openInlineEditor());
          }

          cancelInlineBtn.addEventListener("click", closeInlineEditor);

          saveInlineBtn.addEventListener("click", () => {
            if (saveInlineBtn.dataset.saving === "1") return;

            const editingId = idInput.value;
            if (editingId ? !can("tasks.edit") : !can("tasks.create")) return;

            const title = titleInput.value.trim();
            if (!title) {
              titleInput.focus();
              return;
            }

            saveInlineBtn.dataset.saving = "1";
            saveInlineBtn.disabled = true;

            const existing = editingId ? tasks.find(t => t.id === editingId) : null;

            const selectedOwners = selectedOwnersFromChecklist(ownerInput);

            const data = taskWithOwners({
              ...(existing || {}),
              id: editingId || crypto.randomUUID(),
              title,
              description: descriptionInput.value.trim(),
              team: existing ? existing.team : currentFilter,
              priority: priorityInput.value,
              due: dueInput.value,
              status,
              updates: existing && Array.isArray(existing.updates) ? existing.updates : []
            }, selectedOwners);

            if (editingId) {
              const index = tasks.findIndex(t => t.id === editingId);
              if (index >= 0) tasks[index] = data;
              save(editingId);
            } else if (!tasks.some(row => row.id === data.id)) {
              tasks.push(data);
              save();
            } else {
              save();
            }
            closeInlineEditor();
            render();
          });

          titleInput.addEventListener("keydown", e => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveInlineBtn.click();
            } else if (e.key === "Escape") {
              closeInlineEditor();
            }
          });

          inColumn.forEach(task => {
            const card = document.createElement("article");
            card.className = "task";
            card.draggable = false;
            card.dataset.id = task.id;



            function renderTaskCardView() {
              card.classList.remove("editing");
              card.draggable = false;

              const isCompletedTask = task.status === "Done";
              const canEditTasks = can("tasks.edit");
              const hasDescription = typeof task.description === "string" && task.description.trim();
              const priorityTagHtml = isCompletedTask
                ? ""
                : `<span class="tag ${priorityClass(task.priority)}${canEditTasks ? " priority-quick-trigger" : ""}"${canEditTasks ? ' title="Click to change priority"' : ""}>${task.priority}</span>`;

              card.innerHTML = `
                <div class="task-card-heading">
                  <h3 class="quick-editable-title" title="Click to edit title">${escapeHtml(task.title)}</h3>
                  ${hasDescription ? `
                    <button class="task-info-btn" type="button" aria-label="View task description" title="View description">
                      <svg class="task-info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9"></circle>
                        <path d="M12 11v5"></path>
                        <path d="M12 8h.01"></path>
                      </svg>
                    </button>
                  ` : ""}
                </div>
                <div class="tags">
                  <span class="tag">${escapeHtml(task.team || "No project")}</span>
                  ${priorityTagHtml}
                </div>

                <div class="task-updates">
                  <div class="task-updates-header">
                    <button class="task-updates-expand" type="button" aria-expanded="false" aria-label="Expand updates" title="Expand updates">Updates</button>
                    <button class="task-update-toggle" type="button" aria-label="Add update" title="Add update" aria-expanded="false" data-permission="tasks.addUpdate">+</button>
                  </div>

                  <div class="task-update-entry">
                    <div class="task-update-entry-inner">
                      <textarea class="task-update-input" placeholder="Add latest update..."></textarea>
                      <div class="task-update-actions">
                        <button type="button" class="btn-secondary task-update-cancel">Cancel</button>
                        <button type="button" class="btn-primary task-update-save" data-permission="tasks.addUpdate">Save</button>
                      </div>
                    </div>
                  </div>

                  <div class="task-updates-collapse">
                    <div class="task-updates-collapse-inner">
                      ${updatesHtml(task)}
                    </div>
                  </div>
                </div>

                <div class="task-footer">
                  <div class="task-footer-info">
                    <div class="task-owners${(isCompletedTask || !canEditTasks) ? "" : " task-owners-quick-trigger"}"${(isCompletedTask || !canEditTasks) ? "" : ' title="Click to change owners"'}>
                      ${"Owners: " + escapeHtml(ownerDisplayLabel(task) || "Unassigned")}
                    </div>
                    <div class="task-due${(isCompletedTask || !canEditTasks) ? "" : " task-due-quick-trigger"}"${(isCompletedTask || !canEditTasks) ? "" : ' title="Click to change due date"'}>${escapeHtml(formatDue(task.due))}</div>
                  </div>
                  <div class="actions">
                    ${(isCompletedTask || !canEditTasks) ? "" : '<button class="icon-btn edit-btn" type="button" data-permission="tasks.edit">Edit</button>'}
                    <button class="icon-btn delete-btn" type="button" data-permission="tasks.delete">${isCompletedTask ? "Archive" : "Delete"}</button>
                  </div>
                </div>
              `;

              const titleEl = card.querySelector(".quick-editable-title");
              const infoBtn = card.querySelector(".task-info-btn");
              const priorityEl = card.querySelector(".priority-quick-trigger");
              const ownersEl = card.querySelector(".task-owners-quick-trigger");
              const dueEl = card.querySelector(".task-due-quick-trigger");
              const editBtn = card.querySelector(".edit-btn");
              const deleteBtn = card.querySelector(".delete-btn");
              const updatesExpand = card.querySelector(".task-updates-expand");
              const updatesCollapse = card.querySelector(".task-updates-collapse");
              const updateToggle = card.querySelector(".task-update-toggle");
              const updateEntry = card.querySelector(".task-update-entry");
              const updateInput = card.querySelector(".task-update-input");
              const updateCancel = card.querySelector(".task-update-cancel");
              const updateSave = card.querySelector(".task-update-save");

              if (sessionStorage.getItem("task-tracker-open-updates") === task.id) {
                sessionStorage.removeItem("task-tracker-open-updates");
                updatesCollapse.classList.add("open");
                updatesExpand.setAttribute("aria-expanded", "true");
                updatesExpand.setAttribute("aria-label", "Collapse updates");
                updatesExpand.title = "Collapse updates";
              }

              card.addEventListener("mousedown", e => {
                if (card.classList.contains("editing")) return;

                if (e.target.closest("button, input, select, textarea, details, summary, .quick-editable-title, .priority-quick-trigger, .task-owners-quick-trigger, .task-due-quick-trigger")) {
                  card.draggable = false;
                  return;
                }

                card.draggable = true;
              });

              [infoBtn, editBtn, deleteBtn, updatesExpand, updateToggle, updateCancel, updateSave]
                .filter(Boolean)
                .forEach(btn => {
                btn.draggable = false;

                btn.addEventListener("mousedown", e => {
                  card.draggable = false;
                  e.stopPropagation();
                });

                btn.addEventListener("pointerdown", e => {
                  card.draggable = false;
                  e.stopPropagation();
                });
              });

              if (infoBtn) infoBtn.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                card.draggable = false;

                const existingPopover = document.querySelector(".task-description-popover");
                const isSameTask = existingPopover?.dataset.taskId === task.id;
                if (existingPopover) {
                  if (typeof existingPopover.closePopover === "function") {
                    existingPopover.closePopover();
                  } else {
                    existingPopover.remove();
                  }
                }
                if (isSameTask) return;

                const popover = document.createElement("div");
                popover.className = "task-description-popover";
                popover.dataset.taskId = task.id;
                popover.setAttribute("role", "dialog");
                popover.setAttribute("aria-label", `Description for ${task.title || "task"}`);

                const heading = document.createElement("div");
                heading.className = "task-description-popover-title";
                heading.textContent = "Description";

                const copy = document.createElement("div");
                copy.className = "task-description-popover-copy";
                copy.textContent = task.description.trim();

                popover.appendChild(heading);
                popover.appendChild(copy);
                document.body.appendChild(popover);

                const rect = infoBtn.getBoundingClientRect();
                const gap = 6;
                const popoverWidth = Math.min(300, window.innerWidth - 20);
                const left = Math.min(
                  window.innerWidth - popoverWidth - 10,
                  Math.max(10, rect.right - popoverWidth)
                );

                popover.style.width = `${popoverWidth}px`;
                popover.style.left = `${left}px`;
                popover.style.top = `${rect.bottom + gap}px`;

                const popoverRect = popover.getBoundingClientRect();
                if (popoverRect.bottom > window.innerHeight - 10) {
                  popover.style.top = `${Math.max(10, rect.top - popoverRect.height - gap)}px`;
                }

                const closePopover = () => {
                  document.removeEventListener("pointerdown", onOutsidePointerDown, true);
                  document.removeEventListener("keydown", onPopoverKeydown, true);
                  window.removeEventListener("scroll", closePopover, true);
                  popover.remove();
                };

                const onOutsidePointerDown = event => {
                  if (!popover.contains(event.target) && event.target !== infoBtn) {
                    closePopover();
                  }
                };

                const onPopoverKeydown = event => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closePopover();
                    infoBtn.focus();
                  }
                };

                popover.closePopover = closePopover;
                requestAnimationFrame(() => {
                  document.addEventListener("pointerdown", onOutsidePointerDown, true);
                  document.addEventListener("keydown", onPopoverKeydown, true);
                  window.addEventListener("scroll", closePopover, true);
                });
              });

              titleEl.addEventListener("click", e => {
                if (isCompletedTask || !canEditTasks) return;
                e.preventDefault();
                e.stopPropagation();
                card.draggable = false;

                const originalTitle = task.title || "";
                const input = document.createElement("input");
                input.className = "task-title-quick-edit";
                input.value = originalTitle;

                titleEl.replaceWith(input);
                input.focus();
                input.select();

                let finished = false;

                const finishTitleEdit = saveChange => {
                  if (finished) return;
                  finished = true;

                  if (saveChange) {
                    const nextTitle = input.value.trim();
                    if (nextTitle && nextTitle !== originalTitle) {
                      const index = tasks.findIndex(t => t.id === task.id);
                      if (index >= 0) {
                        tasks[index] = {
                          ...tasks[index],
                          title: nextTitle
                        };
                        save(task.id);
                      }
                    }
                  }

                  render();
                };

                input.addEventListener("keydown", event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    finishTitleEdit(true);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    finishTitleEdit(false);
                  }
                });

                input.addEventListener("blur", () => finishTitleEdit(true));
                input.addEventListener("mousedown", event => event.stopPropagation());
                input.addEventListener("pointerdown", event => event.stopPropagation());
              });

              if (ownersEl) ownersEl.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                card.draggable = false;

                // Close any other open owner popover first.
                document.querySelectorAll(".task-owner-popover").forEach(popover => popover.remove());

                const selected = orderedStaffNames(taskOwners(task));
                const projectMembers = membersForTeam(task.team || currentFilter);
                const visibleNames = [...projectMembers];

                selected.forEach(name => {
                  if (!visibleNames.includes(name)) visibleNames.push(name);
                });

                const popover = document.createElement("div");
                popover.className = "task-owner-popover";
                popover.setAttribute("role", "dialog");
                popover.setAttribute("aria-label", "Edit task owners");

                if (!visibleNames.length) {
                  const empty = document.createElement("div");
                  empty.className = "task-owner-popover-empty";
                  empty.textContent = "No project members assigned";
                  popover.appendChild(empty);
                } else {
                  visibleNames.forEach(name => {
                    const option = document.createElement("label");
                    option.className = "task-owner-popover-option";

                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.value = name;
                    checkbox.checked = selected.includes(name);

                    const text = document.createElement("span");
                    const suffix = projectMembers.includes(name) ? "" : " (not in project)";
                    text.textContent = staffTypeLabel(name) + suffix;

                    option.appendChild(checkbox);
                    option.appendChild(text);
                    popover.appendChild(option);

                    checkbox.addEventListener("change", () => {
                      const chosenOwners = [...popover.querySelectorAll('input[type="checkbox"]:checked')]
                        .map(input => input.value);

                      const index = tasks.findIndex(t => t.id === task.id);
                      if (index < 0) return;

                      tasks[index] = taskWithOwners(tasks[index], chosenOwners);
                      save(task.id);

                      ownersEl.textContent = `Owners: ${ownerDisplayLabel(tasks[index]) || "Unassigned"}`;
                    });
                  });
                }

                document.body.appendChild(popover);

                const rect = ownersEl.getBoundingClientRect();
                const gap = 5;
                const popoverWidth = Math.min(280, Math.max(220, rect.width + 80));
                const left = Math.min(
                  window.innerWidth - popoverWidth - 10,
                  Math.max(10, rect.left)
                );

                popover.style.width = `${popoverWidth}px`;
                popover.style.left = `${left}px`;
                popover.style.top = `${Math.min(window.innerHeight - 10, rect.bottom + gap)}px`;

                const popoverRect = popover.getBoundingClientRect();
                if (popoverRect.bottom > window.innerHeight - 10) {
                  popover.style.top = `${Math.max(10, rect.top - popoverRect.height - gap)}px`;
                }

                const closePopover = () => {
                  document.removeEventListener("pointerdown", onOutsidePointerDown, true);
                  document.removeEventListener("keydown", onPopoverKeydown, true);
                  window.removeEventListener("scroll", closePopover, true);
                  popover.remove();
                };

                const onOutsidePointerDown = event => {
                  if (!popover.contains(event.target) && event.target !== ownersEl) {
                    closePopover();
                  }
                };

                const onPopoverKeydown = event => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closePopover();
                    ownersEl.focus?.();
                  }
                };

                popover.addEventListener("pointerdown", event => {
                  card.draggable = false;
                  event.stopPropagation();
                });

                requestAnimationFrame(() => {
                  document.addEventListener("pointerdown", onOutsidePointerDown, true);
                  document.addEventListener("keydown", onPopoverKeydown, true);
                  window.addEventListener("scroll", closePopover, true);

                  const firstCheckbox = popover.querySelector('input[type="checkbox"]');
                  if (firstCheckbox) firstCheckbox.focus({ preventScroll: true });
                });
              });

              if (dueEl) dueEl.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                card.draggable = false;

                const originalDue = task.due || "";
                const input = document.createElement("input");
                input.type = "date";
                input.className = "task-due-quick-edit";
                input.value = originalDue;
                input.inputMode = "none";

                dueEl.replaceWith(input);
                input.focus({ preventScroll: true });

                // Keep this inside the original click handler. showPicker() requires
                // transient user activation in browsers that implement it.
                if (typeof input.showPicker === "function") {
                  try {
                    input.showPicker();
                  } catch (error) {
                    // Fall through to a synthetic click for browsers with a native
                    // date control that do not expose showPicker() reliably.
                    try {
                      input.click();
                    } catch (clickError) {
                      // The focused native date input remains available as fallback.
                    }
                  }
                } else {
                  try {
                    input.click();
                  } catch (error) {
                    // The focused native date input remains available as fallback.
                  }
                }

                let finished = false;

                const finishDueEdit = saveChange => {
                  if (finished) return;
                  finished = true;

                  if (saveChange) {
                    const index = tasks.findIndex(t => t.id === task.id);
                    if (index >= 0 && input.value !== originalDue) {
                      tasks[index] = {
                        ...tasks[index],
                        due: input.value
                      };
                      save(task.id);
                    }
                  }

                  render();
                };

                input.addEventListener("change", () => finishDueEdit(true));
                input.addEventListener("keydown", event => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    finishDueEdit(false);
                    return;
                  }

                  // Date changes should come from the native mini-calendar, not typing.
                  event.preventDefault();
                });

                input.addEventListener("beforeinput", event => {
                  event.preventDefault();
                });
                input.addEventListener("blur", () => finishDueEdit(true));
                input.addEventListener("mousedown", event => event.stopPropagation());
                input.addEventListener("pointerdown", event => event.stopPropagation());
              });

              if (priorityEl) priorityEl.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                card.draggable = false;

                const originalPriority = task.priority === "High" ? "High" : "Low";
                const select = document.createElement("select");
                select.className = "priority-quick-edit";
                select.innerHTML = `
                  <option value="Low"${originalPriority === "Low" ? " selected" : ""}>Low</option>
                  <option value="High"${originalPriority === "High" ? " selected" : ""}>High</option>
                `;

                priorityEl.replaceWith(select);
                select.focus();

                let finished = false;

                const finishPriorityEdit = saveChange => {
                  if (finished) return;
                  finished = true;

                  if (saveChange) {
                    const nextPriority = select.value === "High" ? "High" : "Low";
                    if (nextPriority !== originalPriority) {
                      const index = tasks.findIndex(t => t.id === task.id);
                      if (index >= 0) {
                        tasks[index] = {
                          ...tasks[index],
                          priority: nextPriority
                        };
                        save(task.id);
                      }
                    }
                  }

                  render();
                };

                select.addEventListener("change", () => finishPriorityEdit(true));
                select.addEventListener("keydown", event => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    finishPriorityEdit(false);
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    finishPriorityEdit(true);
                  }
                });
                select.addEventListener("blur", () => finishPriorityEdit(true));
                select.addEventListener("mousedown", event => event.stopPropagation());
                select.addEventListener("pointerdown", event => event.stopPropagation());
              });

              updatesExpand.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                card.draggable = false;

                const isOpen = updatesCollapse.classList.toggle("open");
                updatesExpand.setAttribute("aria-expanded", isOpen ? "true" : "false");
                updatesExpand.setAttribute("aria-label", isOpen ? "Collapse updates" : "Expand updates");
                updatesExpand.title = isOpen ? "Collapse updates" : "Expand updates";
              });

              updateToggle.addEventListener("click", e => {
                if (!can("tasks.addUpdate")) return;
                e.preventDefault();
                e.stopPropagation();
                card.draggable = false;

                const willOpen = !updateEntry.classList.contains("open");
                updateEntry.classList.toggle("open", willOpen);
                updateToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");

                if (willOpen) {
                  requestAnimationFrame(() => updateInput.focus());
                }
              });

              updateCancel.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                updateInput.value = "";
                updateEntry.classList.remove("open");
                updateToggle.setAttribute("aria-expanded", "false");
              });

              updateSave.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                if (!can("tasks.addUpdate")) return;

                const text = updateInput.value.trim();
                if (!text) {
                  updateInput.focus();
                  return;
                }

                const index = tasks.findIndex(t => t.id === task.id);
                if (index < 0) return;

                const existingUpdates = ensureTaskUpdates(tasks[index]);

                tasks[index] = {
                  ...tasks[index],
                  updates: [
                    ...existingUpdates,
                    {
                      id: crypto.randomUUID(),
                      text,
                      createdAt: new Date().toISOString()
                    }
                  ]
                };

                localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
                localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
                void trackerSync.syncTaskUpdate(task.id, text);
                sessionStorage.setItem("task-tracker-open-updates", task.id);
                render();
              });

              updateInput.addEventListener("keydown", e => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  updateSave.click();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  updateCancel.click();
                }
              });

              if (editBtn) editBtn.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                if (!can("tasks.edit")) return;
                renderTaskCardEditor();
              });

              deleteBtn.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                if (!can("tasks.delete")) return;
                card.draggable = false;

                if (isCompletedTask) {
                  archivedTasks.push({
                    ...task,
                    archivedId: crypto.randomUUID(),
                    archivedAt: new Date().toISOString()
                  });

                  tasks = tasks.filter(t => t.id !== task.id);
                  persistTasksLocally();
                  saveArchivedTasks();
                  void trackerSync.syncTaskArchive(task.id);
                  render();
                  return;
                }

                deletedTasks.push({
                  ...task,
                  previousStatus: task.status,
                  deletedAt: new Date().toISOString()
                });

                tasks = tasks.filter(t => t.id !== task.id);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
                localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(deletedTasks));
                localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
                updateTrashCount();
                void trackerSync.syncTaskDelete(task.id);
                render();
              });
            }

            function renderTaskCardEditor() {
              if (!can("tasks.edit")) return;
              card.classList.add("editing");
              card.draggable = false;

              card.innerHTML = `
                <div class="task-edit-form">
                  <div class="task-edit-grid">
                    <div class="full">
                      <label>Task Title</label>
                      <input class="card-edit-title" value="${escapeHtml(task.title || "")}">
                    </div>

                    <div class="full">
                      <label>Description <span class="optional-label">(optional)</span></label>
                      <textarea class="card-edit-description" placeholder="Add context, expectations, or relevant details">${escapeHtml(task.description || "")}</textarea>
                    </div>

                    <div>
                      <label>Owners</label>
                      <details class="card-edit-owner owner-checklist">
                        ${ownerChecklistInnerHtml(task.team || currentFilter, taskOwners(task))}
                      </details>
                    </div>

                    <div>
                      <label>Priority</label>
                      <select class="card-edit-priority">
                        <option ${task.priority === "Low" ? "selected" : ""}>Low</option>
                        <option ${task.priority === "High" ? "selected" : ""}>High</option>
                      </select>
                    </div>

                    <div class="full">
                      <label>Due Date</label>
                      <input class="card-edit-due" type="date" value="${escapeHtml(task.due || "")}">
                    </div>
                  </div>

                  <div class="task-edit-actions">
                    <button type="button" class="btn-secondary card-edit-cancel">Cancel</button>
                    <button type="button" class="btn-primary card-edit-save">Save</button>
                  </div>
                </div>
              `;

              const titleInput = card.querySelector(".card-edit-title");
              const descriptionInput = card.querySelector(".card-edit-description");
              const ownerInput = card.querySelector(".card-edit-owner");
              bindOwnerChecklist(ownerInput);
              const priorityInput = card.querySelector(".card-edit-priority");
              const dueInput = card.querySelector(".card-edit-due");
              const cancelBtn = card.querySelector(".card-edit-cancel");
              const saveBtn = card.querySelector(".card-edit-save");

              cancelBtn.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                renderTaskCardView();
              });

              saveBtn.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                if (!can("tasks.edit")) return;

                const newTitle = titleInput.value.trim();
                if (!newTitle) {
                  titleInput.focus();
                  return;
                }

                const index = tasks.findIndex(t => t.id === task.id);
                if (index < 0) return;

                tasks[index] = taskWithOwners({
                  ...tasks[index],
                  title: newTitle,
                  description: descriptionInput.value.trim(),
                  priority: priorityInput.value,
                  due: dueInput.value
                }, selectedOwnersFromChecklist(ownerInput));

                save(task.id);
                render();
              });

              titleInput.addEventListener("keydown", e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveBtn.click();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelBtn.click();
                }
              });

              requestAnimationFrame(() => titleInput.focus());
            }

            card.addEventListener("dragstart", e => {
              if (card.classList.contains("editing") || !can("tasks.move")) {
                e.preventDefault();
                return;
              }

              card.classList.add("dragging");
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", task.id);
            });

            card.addEventListener("dragover", e => {
              const dragged = document.querySelector(".task.dragging");
              if (!dragged || dragged === card) return;

              e.preventDefault();
              e.stopPropagation();

              clearTaskDropIndicators();

              const rect = card.getBoundingClientRect();
              const placeAfter = e.clientY > rect.top + rect.height / 2;
              card.classList.add(placeAfter ? "task-drop-after" : "task-drop-before");
            });

            card.addEventListener("drop", e => {
              const dragged = document.querySelector(".task.dragging");
              if (!dragged || dragged === card) return;

              e.preventDefault();
              e.stopPropagation();

              const rect = card.getBoundingClientRect();
              const placeAfter = e.clientY > rect.top + rect.height / 2;

              const draggedId = dragged.dataset.id;
              const wasCompleted = tasks.find(t => t.id === draggedId)?.status === "Done";

              moveTaskRelative(draggedId, task.id, status, placeAfter);
              clearTaskDropIndicators();
              // Local persist only — move uses /move (tasks.move). Do not schedule
              // detail sync/PATCH here (that needs tasks.edit and 403s for staff).
              persistTasksLocally();
              void trackerSync.syncTaskMove(draggedId, status);
              render();

              if (!wasCompleted && status === "Done") celebrateTaskCompletion(draggedId);
            });

            card.addEventListener("dragend", () => {
              card.classList.remove("dragging");
              card.draggable = false;
              clearTaskDropIndicators();
            });

            card.addEventListener("mouseup", () => {
              if (!card.classList.contains("dragging")) card.draggable = false;
            });

            renderTaskCardView();

            list.appendChild(card);
          });

          if (!inColumn.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "Drop tasks here";
            list.appendChild(empty);
          }

          list.addEventListener("dragover", e => {
            const dragged = document.querySelector(".task.dragging");
            if (!dragged) return;

            e.preventDefault();
            clearTaskDropIndicators();
            list.classList.add("task-list-dragover");
          });

          list.addEventListener("dragleave", e => {
            if (!list.contains(e.relatedTarget)) {
              list.classList.remove("task-list-dragover");
            }
          });

          list.addEventListener("drop", e => {
            e.preventDefault();

            const dragged = document.querySelector(".task.dragging");
            if (!dragged) return;

            const visibleTargetIds = [...list.querySelectorAll(".task")]
              .map(card => card.dataset.id)
              .filter(Boolean);

            const draggedId = dragged.dataset.id;
            const wasCompleted = tasks.find(t => t.id === draggedId)?.status === "Done";

            moveTaskToColumnEnd(draggedId, status, visibleTargetIds);
            clearTaskDropIndicators();
            persistTasksLocally();
            void trackerSync.syncTaskMove(draggedId, status);
            render();

            if (!wasCompleted && status === "Done") celebrateTaskCompletion(draggedId);
          });

          board.appendChild(column);
        });

        updateOngoingCount();
        if (ongoingView.classList.contains("active")) {
          renderOngoingActivity();
        }

        applyPermissionGating();
      }


      sidebarCollapseBtn.addEventListener("click", () => {
        if (window.matchMedia("(max-width: 900px)").matches) {
          appSidebar.classList.remove("mobile-open");
          sidebarBackdrop.classList.remove("mobile-open");
          return;
        }

        appSidebar.classList.toggle("collapsed");
      });

      const sidebarFooter = document.getElementById("sidebarFooter");
      const sidebarFooterToggle = document.getElementById("sidebarFooterToggle");
      const sidebarFooterPanel = document.getElementById("sidebarFooterPanel");
      if (sidebarFooter && sidebarFooterToggle && sidebarFooterPanel) {
        sidebarFooterToggle.addEventListener("click", () => {
          const willExpand = sidebarFooter.classList.contains("is-collapsed");
          sidebarFooter.classList.toggle("is-collapsed", !willExpand);
          sidebarFooterPanel.hidden = !willExpand;
          sidebarFooterToggle.setAttribute("aria-expanded", willExpand ? "true" : "false");
          sidebarFooterToggle.title = willExpand ? "Hide account & backup" : "Show account & backup";
        });
      }

      mobileSidebarBtn.addEventListener("click", () => {
        appSidebar.classList.add("mobile-open");
        sidebarBackdrop.classList.add("mobile-open");
      });

      sidebarBackdrop.addEventListener("click", () => {
        appSidebar.classList.remove("mobile-open");
        sidebarBackdrop.classList.remove("mobile-open");
      });

      resetPermissionsBtn.addEventListener("click", () => {
        if (!can("settings.editPermissions")) return;
        if (!confirm("Reset all roles to the default permission matrix? Click Save Permissions to apply.")) return;
        permissionMatrix = structuredClone(DEFAULT_PERMISSION_MATRIX);
        markPermissionMatrixDirty();
        renderSettingsView();
        refreshPermissionsUi({ skipSettings: true });
      });

      savePermissionsBtn.addEventListener("click", () => {
        void persistPermissionMatrix();
      });

      exportDataBtn.addEventListener("click", exportBackup);

      importDataBtn.addEventListener("click", () => {
        setBackupStatus("");
        importDataInput.click();
      });

      importDataInput.addEventListener("change", () => {
        importBackupFile(importDataInput.files?.[0]);
      });

      function closeMobileSidebar() {
        if (window.matchMedia("(max-width: 900px)").matches) {
          appSidebar.classList.remove("mobile-open");
          sidebarBackdrop.classList.remove("mobile-open");
        }
      }

      function applyPermissionGating(root = document) {
        root.querySelectorAll("[data-permission]").forEach(el => {
          const allowed = can(el.dataset.permission);
          if (el.dataset.permissionMode === "disable") {
            el.hidden = false;
            el.classList.toggle("permission-disabled", !allowed);
            el.disabled = !allowed || el.dataset.nonPermissionDisabled === "true";
            if (!allowed) {
              el.title = "You do not have permission for this action";
            } else if (el.title === "You do not have permission for this action") {
              el.removeAttribute("title");
            }
          } else {
            el.hidden = !allowed;
            if ("disabled" in el) {
              el.disabled = !allowed;
            }
          }
        });
      }

      function updateSidebarBrandMark() {
        const allowed = canAccessSettings();
        sidebarBrandMark.classList.toggle("is-admin-interactive", allowed);
        sidebarBrandMark.setAttribute("aria-label", allowed ? "Open permissions settings" : "Task Tracker");
        if (!allowed && settingsView.classList.contains("active")) switchWorkspaceView("tasks");
      }

      function switchWorkspaceView(viewName) {
        if (viewName === "settings" && !canAccessSettings()) viewName = "tasks";

        const views = {
          tasks: tasksView,
          orgTeams: orgTeamsView,
          staff: staffView,
          teams: teamsView,
          schedule: scheduleView,
          completedTasks: completedTasksView,
          ongoing: ongoingView,
          trash: trashView,
          settings: settingsView
        };

        Object.values(views).forEach(view => view.classList.remove("active"));
        views[viewName].classList.add("active");

        const orgTeamsNavBtn = document.getElementById("manageOrgTeamsBtn");
        const staffNavBtn = document.getElementById("manageStaffBtn");
        const teamsNavBtn = document.getElementById("manageTeamsBtn");
        const completedTasksNavBtn = document.getElementById("completedTasksBtn");
        const trashNavBtn = document.getElementById("trashBtn");

        [tasksNavBtn, orgTeamsNavBtn, staffNavBtn, teamsNavBtn, scheduleNavBtn, completedTasksNavBtn, ongoingNavBtn, trashNavBtn, sidebarBrandMark]
          .forEach(btn => btn.classList.remove("active"));

        if (viewName === "tasks") {
          tasksNavBtn.classList.add("active");
          taskFilters.classList.remove("task-filters-hidden");
          workspaceTitle.textContent = "Company Task Tracker";
          workspaceSubtitle.textContent = "Combine project, team, and team member filters, then manage tasks by status";
        } else if (viewName === "orgTeams") {
          orgTeamsNavBtn.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Teams";
          workspaceSubtitle.textContent = "Assign each Team Member to one or more organizational teams";
          renderOrgTeamManager();
        } else if (viewName === "staff") {
          staffNavBtn.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Team Members";
          workspaceSubtitle.textContent = "Manage the team members who can be assigned work";
          renderStaffManager();
        } else if (viewName === "teams") {
          teamsNavBtn.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Projects";
          workspaceSubtitle.textContent = "Manage projects and assign team members to them";
          renderTeamManager();
        } else if (viewName === "schedule") {
          scheduleNavBtn.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Schedule";
          workspaceSubtitle.textContent = "Plan the week with a Google-style calendar view";
          renderScheduleView();
          if (!scheduleNowTimer) {
            scheduleNowTimer = setInterval(() => {
              if (scheduleView.classList.contains("active")) {
                renderScheduleView({ preserveScroll: true });
              }
            }, 60000);
          }
        } else if (viewName === "completedTasks") {
          completedTasksNavBtn.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Completed Tasks";
          workspaceSubtitle.textContent = "A permanent log of finished, archived work";
          renderCompletedTasks();
        } else if (viewName === "ongoing") {
          ongoingNavBtn.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Ongoing Activity";
          workspaceSubtitle.textContent = "Projects in flight — expand to see employee stats and open tasks";
          renderOngoingActivity();
        } else if (viewName === "trash") {
          trashNavBtn.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Deleted Tasks";
          workspaceSubtitle.textContent = "Review and restore deleted work";
          renderTrash();
        } else if (viewName === "settings") {
          sidebarBrandMark.classList.add("active");
          taskFilters.classList.add("task-filters-hidden");
          workspaceTitle.textContent = "Permissions & Access";
          workspaceSubtitle.textContent = "Configure roles and the permission matrix, and assign roles to Team Members.";
          renderSettingsView();
        }

        closeMobileSidebar();
      }

      if (addTaskProjectContinueBtn) {
        addTaskProjectContinueBtn.addEventListener("click", confirmAddTaskProjectModal);
      }
      if (addTaskProjectCancelBtn) {
        addTaskProjectCancelBtn.addEventListener("click", () => {
          pendingAddTaskStatus = "";
          closeAddTaskProjectModal();
        });
      }
      if (addTaskProjectModalClose) {
        addTaskProjectModalClose.addEventListener("click", () => {
          pendingAddTaskStatus = "";
          closeAddTaskProjectModal();
        });
      }
      if (addTaskProjectModalBackdrop) {
        addTaskProjectModalBackdrop.addEventListener("click", event => {
          if (event.target === addTaskProjectModalBackdrop) {
            pendingAddTaskStatus = "";
            closeAddTaskProjectModal();
          }
        });
      }

      // Project and Team describe overlapping groupings, so only one narrows the
      // board at a time. Team Member stacks with whichever is active.
      teamFilter.addEventListener("change", () => {
        currentFilter = teamFilter.value;

        if (currentFilter !== "All") {
          currentOrgTeamFilter = "All";
          orgTeamFilter.value = "All";
        }

        render();
      });

      orgTeamFilter.addEventListener("change", () => {
        currentOrgTeamFilter = orgTeamFilter.value;

        if (currentOrgTeamFilter !== "All") {
          currentFilter = "All";
          teamFilter.value = "All";
        }

        render();
      });

      staffFilter.addEventListener("change", () => {
        currentStaffFilter = staffFilter.value;
        render();
      });

      clearFiltersBtn.addEventListener("click", () => {
        currentFilter = "All";
        currentOrgTeamFilter = "All";
        currentStaffFilter = "All";
        teamFilter.value = "All";
        orgTeamFilter.value = "All";
        staffFilter.value = "All";
        render();
      });

      scheduleProjectFilter.addEventListener("change", () => {
        currentScheduleProjectFilter = scheduleProjectFilter.value;
        updateScheduleFilterControls();
        renderScheduleView({ preserveScroll: true });
      });

      scheduleOrgTeamFilter.addEventListener("change", () => {
        currentScheduleOrgTeamFilter = scheduleOrgTeamFilter.value;
        updateScheduleFilterControls();
        renderScheduleView({ preserveScroll: true });
      });

      scheduleClearFiltersBtn.addEventListener("click", () => {
        currentScheduleProjectFilter = "All";
        currentScheduleOrgTeamFilter = "All";
        scheduleProjectFilter.value = "All";
        scheduleOrgTeamFilter.value = "All";
        updateScheduleFilterControls();
        renderScheduleView({ preserveScroll: true });
      });

      tasksNavBtn.addEventListener("click", () => {
        switchWorkspaceView("tasks");
      });

      sidebarBrandMark.addEventListener("click", () => {
        if (!canAccessSettings()) return; // defensive; inert state already blocks this
        switchWorkspaceView("settings");
      });

      document.getElementById("manageOrgTeamsBtn").addEventListener("click", () => {
        switchWorkspaceView("orgTeams");
      });

      document.getElementById("addOrgTeamBtn").addEventListener("click", addOrgTeam);

      newOrgTeamName.addEventListener("input", () => {
        clearFormFeedback([newOrgTeamName], orgTeamFormFeedback);
      });

      newOrgTeamName.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          addOrgTeam();
        }
      });

      document.getElementById("trashBtn").addEventListener("click", () => {
        switchWorkspaceView("trash");
      });

      document.getElementById("completedTasksBtn").addEventListener("click", () => {
        switchWorkspaceView("completedTasks");
      });

      ongoingNavBtn.addEventListener("click", () => {
        switchWorkspaceView("ongoing");
      });

      if (ongoingSearch) {
        ongoingSearch.addEventListener("input", () => {
          if (ongoingView.classList.contains("active")) renderOngoingActivity();
        });
      }

      if (ongoingDeptFilter) {
        ongoingDeptFilter.addEventListener("change", () => {
          if (ongoingView.classList.contains("active")) renderOngoingActivity();
        });
      }

      document.getElementById("manageStaffBtn").addEventListener("click", () => {
        switchWorkspaceView("staff");
      });

      document.getElementById("manageTeamsBtn").addEventListener("click", () => {
        switchWorkspaceView("teams");
      });

      scheduleNavBtn.addEventListener("click", () => {
        switchWorkspaceView("schedule");
      });

      scheduleTodayBtn.addEventListener("click", jumpScheduleToToday);
      schedulePrevBtn.addEventListener("click", () => shiftScheduleWeek(-1));
      scheduleNextBtn.addEventListener("click", () => shiftScheduleWeek(1));
      scheduleCreateBtn.addEventListener("click", () => {
        if (!can("schedule.create")) return;
        const now = new Date();
        now.setMinutes(0, 0, 0);
        if (now.getHours() < SCHEDULE_DAY_START_HOUR) now.setHours(SCHEDULE_DAY_START_HOUR);
        const end = new Date(now.getTime() + 60 * 60 * 1000);
        openScheduleModal(createDraftEvent(now, end, false), true);
      });

      scheduleModalClose.addEventListener("click", closeScheduleModal);
      scheduleEventCancelBtn.addEventListener("click", closeScheduleModal);
      scheduleModalBackdrop.addEventListener("click", event => {
        if (event.target === scheduleModalBackdrop) closeScheduleModal();
      });
      scheduleEventSaveBtn.addEventListener("click", saveScheduleModalEvent);
      scheduleEventDeleteBtn.addEventListener("click", deleteScheduleModalEvent);
      scheduleGuestSelect.addEventListener("change", () => {
        const name = scheduleGuestSelect.value;
        if (!name) return;
        if (!scheduleSelectedGuests.includes(name)) scheduleSelectedGuests.push(name);
        renderScheduleGuestDropdown();
      });
      scheduleEventProject.addEventListener("change", () => {
        renderScheduleProjectSection();
        renderScheduleGuestDropdown();
      });
      scheduleEventAllDay.addEventListener("change", () => {
        const date = parseDisplayDate(scheduleEventDate.value) || new Date();
        const start = applyTimeToDate(date, scheduleEventStartTime.value || "09:00");
        let end = applyTimeToDate(date, scheduleEventEndTime.value || "10:00");
        if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
        syncScheduleModalTimeInputs(start, end, scheduleEventAllDay.checked);
      });

      scheduleEventDate.addEventListener("blur", () => {
        const date = parseDisplayDate(scheduleEventDate.value);
        if (date) {
          scheduleEventDate.value = formatDisplayDate(date);
          syncScheduleNativeDatePicker(date);
        }
      });

      scheduleEventDatePickerBtn?.addEventListener("click", () => {
        openScheduleDatePicker();
      });

      scheduleEventDatePicker?.addEventListener("change", () => {
        const date = parseDateInputValue(scheduleEventDatePicker.value);
        if (!date) return;
        scheduleEventDate.value = formatDisplayDate(date);
        if (scheduleEventAllDay.checked) return;
        const start = applyTimeToDate(date, scheduleEventStartTime.value || "09:00");
        let end = applyTimeToDate(date, scheduleEventEndTime.value || "10:00");
        if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
        scheduleEventStartTime.value = toTimeInputValue(start);
        scheduleEventEndTime.value = toTimeInputValue(end);
      });

      document.addEventListener("keydown", event => {
        if (event.key === "Escape" && addTaskProjectModalBackdrop && !addTaskProjectModalBackdrop.hidden) {
          pendingAddTaskStatus = "";
          closeAddTaskProjectModal();
          return;
        }
        if (event.key === "Escape" && !scheduleModalBackdrop.hidden) {
          closeScheduleModal();
        }
      });

      document.getElementById("addTeamBtn").addEventListener("click", addTeam);

      newTeamName.addEventListener("input", () => {
        clearFormFeedback([newTeamName], projectFormFeedback);
      });

      newTeamName.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          addTeam();
        }
      });

      populateTeamFilter();
      populateOrgTeamFilter();
      populateStaffFilter();
      setupAuthenticatedUserUi();
      populateCurrentUserSelect();

      function reloadWorkspaceState(data) {
        console.log("[project-config]", {
          layer: "ui",
          step: "reloadWorkspaceState",
          projectsViewActive: teamsView.classList.contains("active"),
          willCallRefreshPermissionsUi: !permissionMatrixDirty,
        });
        applyPreloadedWorkspace(data);
        tasks = readStoredJson(STORAGE_KEY, demoTasks, isRecordArray).map(task => taskWithOwners({
          ...task,
          status: task.status === "Backlog" ? "To Do" : task.status,
          priority: task.priority === "High" ? "High" : "Low"
        }, task.owners || task.owner));
        deletedTasks = readStoredJson(TRASH_STORAGE_KEY, [], isRecordArray).map(task => taskWithOwners({
          ...task
        }, task.owners || task.owner));
        archivedTasks = readStoredJson(ARCHIVED_STORAGE_KEY, [], isRecordArray).map(task => taskWithOwners({
          ...task,
          archivedId: task.archivedId || crypto.randomUUID()
        }, task.owners || task.owner));
        teams = readStoredJson(TEAM_STORAGE_KEY, [...defaultTeams], isStringArray);
        staff = readStoredJson(STAFF_STORAGE_KEY, [...defaultStaff], isStringArray);
        staffProfiles = readStoredJson(
          STAFF_PROFILES_STORAGE_KEY,
          {},
          value => isRecord(value) && Object.values(value).every(isRecord)
        );
        orgTeams = readStoredJson(ORG_TEAMS_STORAGE_KEY, [], isStringArray);
        orgTeamMembers = readStoredJson(
          ORG_TEAM_MEMBERS_STORAGE_KEY,
          {},
          isStringArrayRecord
        );
        schedule = normalizeSchedule(
          readStoredJson(SCHEDULE_STORAGE_KEY, { events: [] }, isValidSchedule)
        );
        teamMembers = readStoredJson(TEAM_MEMBERS_STORAGE_KEY, null, isStringArrayRecord) || {};
        teamLeaders = readStoredJson(TEAM_LEADERS_STORAGE_KEY, {}, isStringRecord);
        if (!permissionMatrixDirty) {
          permissionMatrix = readStoredJson(
            PERMISSION_MATRIX_STORAGE_KEY,
            DEFAULT_PERMISSION_MATRIX,
            isValidPermissionMatrix
          );
        }
        updateTrashCount();
        updateArchivedCount();
        updateOngoingCount();
        populateTeamFilter();
        populateOrgTeamFilter();
        populateStaffFilter();
        trackerSync.snapshotKnownIds();
        if (!permissionMatrixDirty) {
          refreshPermissionsUi({ skipSettings: true });
        } else {
          applyPermissionGating();
        }
      }

      function highlightNotificationTarget(element) {
        if (!element) return;
        element.classList.add("notification-target-highlight");
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => {
          element.classList.remove("notification-target-highlight");
        }, 2600);
      }

      function navigateToNotification(notification) {
        if (!notification) return;

        if (notification.type === "TASK_ASSIGNED" || notification.resourceType === "task") {
          switchWorkspaceView("tasks");
          render();
          const card = document.querySelector(`[data-id="${notification.resourceId}"]`);
          highlightNotificationTarget(card);
          return;
        }

        if (notification.type === "PROJECT_ASSIGNED" || notification.resourceType === "project") {
          switchWorkspaceView("teams");
          renderTeamManager();
          const row = document.querySelector(`.team-row[data-project-id="${notification.resourceId}"]`);
          highlightNotificationTarget(row);
          return;
        }

        if (notification.type === "SCHEDULE_INVITED" || notification.resourceType === "schedule") {
          switchWorkspaceView("schedule");
          const event = getScheduleEventById(notification.resourceId);
          if (event) {
            openScheduleModal(event);
          } else {
            renderScheduleView();
          }
        }
      }

      let notificationCenter = null;
      if (authUser?.staffMember?.id) {
        notificationCenter = createNotificationCenter({
          recipientStaffId: authUser.staffMember.id,
          navigate: navigateToNotification,
        });
      }

      const trackerClientId = crypto.randomUUID();
      console.log("[project-config]", {
        layer: "ui",
        step: "init-shared-client-id",
        clientId: trackerClientId,
      });

      trackerSync = createTrackerSync({
        clientId: trackerClientId,
        getTasks: () => tasks,
        setTasks: nextTasks => {
          tasks = nextTasks;
        },
        getDeletedTasks: () => deletedTasks,
        setDeletedTasks: nextDeletedTasks => {
          deletedTasks = nextDeletedTasks;
        },
        getArchivedTasks: () => archivedTasks,
        setArchivedTasks: nextArchivedTasks => {
          archivedTasks = nextArchivedTasks;
        },
        getSchedule: () => schedule,
        setSchedule: (nextSchedule, options = {}) => {
          schedule = nextSchedule;
          if (options.persist) {
            localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
            localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
          }
        },
        applyWorkspaceData: reloadWorkspaceState,
        render,
        renderTrash,
        renderScheduleView,
        setBackupStatus,
        onNotificationCreated: (notification) => {
          notificationCenter?.handleRemoteNotification(notification);
        },
        refreshNotifications: () => notificationCenter?.refresh(),
        canSeeAllProjects:
          authUser?.staffMember?.permissionRole === "Super Admin" ||
          authUser?.staffMember?.permissionRole === "Admin",
      });

      settingsSync = createSettingsSync({
        clientId: trackerClientId,
        getProjectIds: () => projectIds,
        setProjectIds: nextIds => {
          projectIds = nextIds;
        },
        getOrgTeamIds: () => orgTeamIds,
        setOrgTeamIds: nextIds => {
          orgTeamIds = nextIds;
        },
        getStaffIds: () => staffIds,
        setStaffIds: nextIds => {
          staffIds = nextIds;
        },
        getTeamMembers: () => teamMembers,
        getTeamLeaders: () => teamLeaders,
        getOrgTeamMembers: () => orgTeamMembers,
        setBackupStatus,
      });

      if (preloadData) {
        updateTrashCount();
        updateArchivedCount();
        updateOngoingCount();
      } else {
        // Persist locally only — do not schedule API sync before trackerSync.init()
        // has snapshotted known task ids (that race POSTs every task → 403).
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        localStorage.setItem(LAST_MODIFIED_STORAGE_KEY, new Date().toISOString());
        saveTrash();
        saveArchivedTasks();
        saveStaff();
        saveStaffProfiles();
        saveOrgTeams();
        saveOrgTeamMembers();
        saveTeamMembers();
        saveTeamLeaders();
      }
      render();
      updateSidebarBrandMark();
      applyPermissionGating();
      switchWorkspaceView("tasks");
      initializeFolderPersistence();
      trackerSync.init(initialWorkspaceRevision);

      if (notificationCenter) {
        void notificationCenter.init();
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            void notificationCenter.refresh();
          }
        });
        const deepLinkParams = new URLSearchParams(window.location.search);
        notificationCenter.consumeDeepLink(
          deepLinkParams.get("notify"),
          deepLinkParams.get("id"),
        );
      }
  

}
