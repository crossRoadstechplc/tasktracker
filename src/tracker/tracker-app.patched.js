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
    // Local to this browser only â€” a stand-in for real identity until Google
    // sign-in is wired up. Deliberately NOT in BACKUP_STORAGE_KEYS: it must
    // never travel through export/import or the shared data-folder sync, or
    // one teammate's save would silently switch who another teammate appears
    // to be signed in as.
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
    // Roles & permissions. This is a client-side UI-affordance layer only â€”
    // it hides/disables actions based on a locally-stored "signed in as"
    // pick, not real authentication. See getCurrentUser() below for the
    // seam where real sign-in will eventually plug in.
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

      { id: "staff.create", group: "Team Members", label: "Add team members" },
      { id: "staff.edit", group: "Team Members", label: "Edit team member name/job title" },
      { id: "staff.delete", group: "Team Members", label: "Remove team members" },
      { id: "staff.assignRole", group: "Team Members", label: "Assign permission role to a team member" },

      { id: "schedule.create", group: "Schedule", label: "Create schedule events" },
      { id: "schedule.edit", group: "Schedule", label: "Edit, move, or resize schedule events" },
      { id: "schedule.delete", group: "Schedule", label: "Delete schedule events" },

      { id: "backup.export", group: "Backup", label: "Export a backup file" },
      { id: "backup.import", group: "Backup", label: "Import a backup file" },

      { id: "settings.editPermissions", group: "Settings", label: "Edit the permission matrix" }
    ];

    // Written out explicitly (not derived) so it stays easy to eyeball and
    // hand-edit. Super Admin is always fully granted â€” see can() below,
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
      ...task,
      trashId: task.trashId || crypto.randomUUID()
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

    // Backfill permissionRole on profiles that predate this feature (or have
    // a stale/invalid value), and make sure at least one Super Admin exists
    // so nobody gets locked out of Settings. This check is deliberately NOT
    // scoped to isFirstPermissionsRun â€” this local-folder-sync app can
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
    // AUTH SEAM â€” everything above this comment is placeholder identity: a
    // "Signed in as" pick, stored in this browser's localStorage only.
    // When real "Sign in with Google" auth is wired up, replace ONLY the
    // body of getCurrentUser() with a lookup from the authenticated Google
    // identity, mapped to a Team Member record. Nothing else in the
    // permission system (can(), applyPermissionGating(), the Settings
    // screen, or any data-permission attribute in the markup) should need
    // to change.
    // =====================================================================
    let currentUserName = localStorage.getItem(CURRENT_USER_STORAGE_KEY) || "";
    if (!staff.includes(currentUserName)) currentUserName = staff[0] || "";

    function getCurrentUser() {
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
      return ["Super Admin", "Admin"].includes(getCurrentUserRole());
    }

    function can(actionId) {
      const role = getCurrentUserRole();
      if (role === "Super Admin") return true; // hard safeguard, ignores the stored matrix
      return Boolean(permissionMatrix[role] && permissionMatrix[role][actionId]);
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
    const staffManagerList = document.getElementById("staffManagerList");
    const newStaffFirstName = document.getElementById("newStaffFirstName");
    const newStaffLastName = document.getElementById("newStaffLastName");
    const newStaffRole = document.getElementById("newStaffRole");
    const staffFormFeedback = document.getElementById("staffFormFeedback");

    const tasksView = document.getElementById("tasksView");
    const orgTeamsView = document.getElementById("orgTeamsView");
    const staffView = document.getElementById("staffView");
    const teamsView = document.getElementById("teamsView");
    const trashView = document.getElementById("trashView");
    const completedTasksView = document.getElementById("completedTasksView");
    const settingsView = document.getElementById("settingsView");
    const permissionMatrixWrap = document.getElementById("permissionMatrixWrap");
    const resetPermissionsBtn = document.getElementById("resetPermissionsBtn");
    const scheduleView = document.getElementById("scheduleView");
    const scheduleNavBtn = document.getElementById("scheduleNavBtn");
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
    const scheduleEventStartTime = document.getElementById("scheduleEventStartTime");
    const scheduleEventEndTime = document.getElementById("scheduleEventEndTime");
    const scheduleStartTimeField = document.getElementById("scheduleStartTimeField");
    const scheduleEndTimeField = document.getElementById("scheduleEndTimeField");
    const scheduleDateTimeRow = document.getElementById("scheduleDateTimeRow");
    const scheduleEventLocation = document.getElementById("scheduleEventLocation");
    const scheduleEventProject = document.getElementById("scheduleEventProject");
    const scheduleEventDescription = document.getElementById("scheduleEventDescription");
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
          permissionMatrix
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

    function usesLocalFolderServer() {
      return typeof window !== "undefined";
    }

    async function writeBackupToFolder(backup) {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup.data)
      });

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
          .then(() => setBackupStatus("Saved to local data folder."))
          .catch(error => {
            console.error("Could not save tracker data to the local folder.", error);
            setBackupStatus("Local folder auto-save failed. Export a backup for safety.", true);
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
      if (!usesLocalFolderServer()) {
        setBackupStatus("This page was not opened through start.command, so changes stay in this browser only and are not written to the data folder.", true);
        return;
      }

      try {
        const response = await fetch("/api/data", { cache: "no-store" });

        if (response.status === 404) {
          folderPersistenceReady = true;
          await writeBackupToFolder(createBackupPayload());
          folderSyncPending = false;
          setBackupStatus("Auto-save to local data folder is on.");
          return;
        }

        if (!response.ok) {
          throw new Error(`Folder load failed with status ${response.status}.`);
        }

        const backup = await response.json();
        const validationError = validateBackupPayload(backup);
        if (validationError) throw new Error(validationError);

        const currentData = createBackupPayload().data;
        if (JSON.stringify(backup.data) !== JSON.stringify(currentData)) {
          // Whichever copy was edited most recently wins. A browser with no
          // workspace of its own always adopts the folder; when this browser has
          // never recorded an edit we keep it, so an untimestamped session can
          // never be wiped by an older file.
          const folderIsNewer = Boolean(
            storedLastModified && backup.exportedAt && backup.exportedAt > storedLastModified
          );

          if (!hadStoredWorkspaceData || folderIsNewer) {
            replaceLocalStorageFromBackup(backup);
            window.location.reload();
            return;
          }

          folderPersistenceReady = true;
          await writeBackupToFolder(createBackupPayload());
          folderSyncPending = false;
          setBackupStatus("This browser had newer data, so the data folder was updated.");
          return;
        }

        folderPersistenceReady = true;
        setBackupStatus("Auto-save to local data folder is on.");

        if (folderSyncPending) {
          folderSyncPending = false;
          scheduleFolderSync();
        }
      } catch (error) {
        console.error("Local folder persistence is unavailable.", error);
        setBackupStatus("Folder auto-save is unavailable. Start with start.command or export backups manually.", true);
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

    function save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      scheduleFolderSync();
    }

    function saveTrash() {
      localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(deletedTasks));
      updateTrashCount();
      scheduleFolderSync();
    }

    function saveArchivedTasks() {
      localStorage.setItem(ARCHIVED_STORAGE_KEY, JSON.stringify(archivedTasks));
      updateArchivedCount();
      scheduleFolderSync();
    }

    function updateTrashCount() {
      trashCount.textContent = deletedTasks.length;
    }

    function updateArchivedCount() {
      archivedCount.textContent = archivedTasks.length;
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
          savePermissionMatrix();
          applyPermissionGating();
        });
      });

      resetPermissionsBtn.hidden = !can("settings.editPermissions");
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
            deletedTasks = deletedTasks.filter(t => t.trashId !== trashId);
            save();
            saveTrash();
            renderTrash();
            render();
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
      scheduleFolderSync();
    }

    function savePermissionMatrix() {
      localStorage.setItem(PERMISSION_MATRIX_STORAGE_KEY, JSON.stringify(permissionMatrix));
      scheduleFolderSync();
    }

    function saveOrgTeams() {
      localStorage.setItem(ORG_TEAMS_STORAGE_KEY, JSON.stringify(orgTeams));
      scheduleFolderSync();
    }

    function saveOrgTeamMembers() {
      localStorage.setItem(ORG_TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(orgTeamMembers));
      scheduleFolderSync();
    }

    function saveSchedule() {
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
      scheduleFolderSync();
    }

    function orgTeamsForStaff(name) {
      return orgTeams.filter(orgTeam => (orgTeamMembers[orgTeam] || []).includes(name));
    }

    // Kept short so dropdown options never stretch their control.
    function staffTypeLabel(name) {
      const [first, ...rest] = orgTeamsForStaff(name);
      if (!first) return name;
      return rest.length ? `${name} Â· ${first} +${rest.length}` : `${name} Â· ${first}`;
    }

    function staffMetaLabel(name) {
      const profile = staffProfiles[name] || { role: "" };
      const memberships = orgTeamsForStaff(name);
      return [
        profile.role || "No role set",
        memberships.length ? memberships.join(", ") : "No teams"
      ].join(" Â· ");
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
      staffManagerList.classList.add("staff-table");

      const header = document.createElement("div");
      header.className = "staff-table-header";
      header.innerHTML = `
        <div>Team Member</div>
        <div>Actions</div>
      `;
      staffManagerList.appendChild(header);

      staff.forEach(name => {
        const profile = staffProfiles[name] || {
          ...splitStaffName(name),
          role: "",
          permissionRole: DEFAULT_STAFF_PERMISSION_ROLE
        };

        const row = document.createElement("div");
        row.className = "staff-row";

        const nameCell = document.createElement("div");
        nameCell.className = "staff-cell staff-name-cell";

        const dragHandle = createReorderHandle(`Drag to reorder ${name}`);

        const displayWrap = document.createElement("div");
        displayWrap.className = "staff-display-wrap";

        const displayName = document.createElement("div");
        displayName.className = "staff-display-name";
        displayName.textContent = name;

        const displayRole = document.createElement("div");
        displayRole.className = "staff-display-role";
        displayRole.textContent = staffMetaLabel(name);

        displayWrap.appendChild(displayName);
        displayWrap.appendChild(displayRole);

        nameCell.appendChild(dragHandle);
        nameCell.appendChild(displayWrap);

        const actions = document.createElement("div");
        actions.className = "staff-cell staff-row-actions";

        const configureBtn = document.createElement("button");
        configureBtn.type = "button";
        configureBtn.className = "staff-configure-btn";
        configureBtn.textContent = "Configure";
        configureBtn.dataset.permission = "staff.edit";

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "save-team-btn staff-config-save";
        saveBtn.textContent = "Save";
        saveBtn.hidden = true;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger-btn";
        removeBtn.textContent = "Remove";
        removeBtn.dataset.permission = "staff.delete";

        const profilePanel = document.createElement("div");
        profilePanel.className = "staff-profile-panel";
        profilePanel.hidden = true;

        const profileGrid = document.createElement("div");
        profileGrid.className = "staff-profile-grid";

        function makeProfileField(labelText, value, className) {
          const field = document.createElement("label");
          field.className = "staff-profile-field";

          const label = document.createElement("span");
          label.textContent = labelText;

          const input = document.createElement("input");
          input.className = className;
          input.value = value || "";
          input.autocomplete = "off";

          field.appendChild(label);
          field.appendChild(input);

          return { field, input };
        }

        function makePermissionRoleField(value) {
          const field = document.createElement("label");
          field.className = "staff-profile-field";

          const label = document.createElement("span");
          label.textContent = "Permission Role";

          const select = document.createElement("select");
          select.className = "staff-profile-permission-role";
          select.disabled = !can("staff.assignRole");
          PERMISSION_ROLES.forEach(role => {
            const option = document.createElement("option");
            option.value = role;
            option.textContent = role;
            if (role === value) option.selected = true;
            select.appendChild(option);
          });

          field.appendChild(label);
          field.appendChild(select);

          return { field, select };
        }

        const firstNameField = makeProfileField("First Name", profile.firstName, "staff-profile-first");
        const lastNameField = makeProfileField("Last Name", profile.lastName, "staff-profile-last");
        const roleField = makeProfileField("Role", profile.role, "staff-profile-role");
        const permissionRoleField = makePermissionRoleField(
          PERMISSION_ROLES.includes(profile.permissionRole) ? profile.permissionRole : DEFAULT_STAFF_PERMISSION_ROLE
        );

        profileGrid.appendChild(firstNameField.field);
        profileGrid.appendChild(lastNameField.field);
        profileGrid.appendChild(roleField.field);
        profileGrid.appendChild(permissionRoleField.field);
        profilePanel.appendChild(profileGrid);

        configureBtn.addEventListener("click", () => {
          profilePanel.hidden = false;
          configureBtn.hidden = true;
          saveBtn.hidden = false;
          requestAnimationFrame(() => firstNameField.input.focus());
        });

        saveBtn.addEventListener("click", () => {
          const firstName = firstNameField.input.value.trim();
          const lastName = lastNameField.input.value.trim();
          const role = roleField.input.value.trim();
          const nextPermissionRole = permissionRoleField.select.value;

          const newName = [firstName, lastName].filter(Boolean).join(" ").trim();

          if (!newName) {
            firstNameField.input.focus();
            return;
          }

          const wasLastSuperAdmin = profile.permissionRole === "Super Admin" &&
            nextPermissionRole !== "Super Admin" &&
            staff.filter(n => n !== name).every(n => staffProfiles[n]?.permissionRole !== "Super Admin");

          if (wasLastSuperAdmin && !confirm(
            `${name} is the only Super Admin. Removing this role means no one will be able to reach Settings unless another Super Admin is assigned first. Continue?`
          )) {
            return;
          }

          const duplicate = staff.some(memberName =>
            memberName !== name && memberName.toLowerCase() === newName.toLowerCase()
          );

          if (duplicate) {
            firstNameField.input.focus();
            return;
          }

          if (newName !== name) {
            staff = staff.map(memberName => memberName === name ? newName : memberName);

            tasks = tasks.map(task => {
              const owners = taskOwners(task).map(ownerName =>
                ownerName === name ? newName : ownerName
              );
              return taskWithOwners(task, owners);
            });

            Object.keys(teamMembers).forEach(teamName => {
              teamMembers[teamName] = (teamMembers[teamName] || []).map(member =>
                member === name ? newName : member
              );

              if (teamLeaders[teamName] === name) {
                teamLeaders[teamName] = newName;
              }
            });

            Object.keys(orgTeamMembers).forEach(orgTeam => {
              orgTeamMembers[orgTeam] = (orgTeamMembers[orgTeam] || []).map(member =>
                member === name ? newName : member
              );
            });

            schedule.events = schedule.events.map(event => ({
              ...event,
              guests: (event.guests || []).map(guest => guest === name ? newName : guest)
            }));

            deletedTasks = deletedTasks.map(task => {
              const owners = taskOwners(task).map(ownerName =>
                ownerName === name ? newName : ownerName
              );
              return taskWithOwners(task, owners);
            });

            delete staffProfiles[name];
          }

          staffProfiles[newName] = {
            firstName,
            lastName,
            role,
            permissionRole: nextPermissionRole
          };

          saveStaff();
          saveStaffProfiles();
          saveTeamMembers();
          saveTeamLeaders();
          saveOrgTeamMembers();
          saveSchedule();
          save();
          saveTrash();

          if (currentStaffFilter === name) {
            currentStaffFilter = newName;
          }

          const editedCurrentUser = currentUserName === name;
          if (editedCurrentUser) currentUserName = newName;

          populateStaffFilter();
          populateCurrentUserSelect();
          staffFilter.value = currentStaffFilter;
          renderStaffManager();
          renderScheduleView();
          render();
          if (editedCurrentUser) {
            localStorage.setItem(CURRENT_USER_STORAGE_KEY, currentUserName);
            onCurrentUserChanged();
          }
        });

        [firstNameField.input, lastNameField.input, roleField.input, permissionRoleField.select].forEach(profileInput => {
          profileInput.addEventListener("keydown", e => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveBtn.click();
            } else if (e.key === "Escape") {
              e.preventDefault();
              profilePanel.hidden = true;
              saveBtn.hidden = true;
              configureBtn.hidden = false;
            }
          });
        });

        let removeArmed = false;
        let resetTimer = null;

        removeBtn.addEventListener("click", () => {
          const assignedCount = tasks.filter(t => taskOwners(t).includes(name)).length;

          if (!removeArmed) {
            removeArmed = true;
            removeBtn.textContent = assignedCount
              ? `Confirm Â· unassign ${assignedCount}`
              : "Confirm";

            resetTimer = setTimeout(() => {
              removeArmed = false;
              removeBtn.textContent = "Remove";
            }, 6000);
            return;
          }

          if (resetTimer) clearTimeout(resetTimer);

          tasks = tasks.map(task =>
            taskWithOwners(task, taskOwners(task).filter(ownerName => ownerName !== name))
          );

          staff = staff.filter(memberName => memberName !== name);
          delete staffProfiles[name];

          Object.keys(orgTeamMembers).forEach(orgTeam => {
            orgTeamMembers[orgTeam] = (orgTeamMembers[orgTeam] || []).filter(member => member !== name);
          });

          Object.keys(teamMembers).forEach(teamName => {
            teamMembers[teamName] = (teamMembers[teamName] || []).filter(member => member !== name);

            if (teamLeaders[teamName] === name) {
              teamLeaders[teamName] = "";
            }
          });

          schedule.events = schedule.events.map(event => ({
            ...event,
            guests: (event.guests || []).filter(guest => guest !== name)
          }));

          saveStaff();
          saveStaffProfiles();
          saveTeamMembers();
          saveTeamLeaders();
          saveOrgTeamMembers();
          saveSchedule();
          save();

          if (currentStaffFilter === name) {
            currentStaffFilter = "All";
          }

          populateStaffFilter();
          populateCurrentUserSelect();
          staffFilter.value = currentStaffFilter;
          renderStaffManager();
          renderScheduleView();
          render();
        });

        attachRowReorder({
          row,
          handle: dragHandle,
          container: staffManagerList,
          value: name,
          state: reorderState.staff,
          getList: () => staff,
          onReorder: nextList => {
            staff = nextList;
            saveStaff();
            populateStaffFilter();
            populateCurrentUserSelect();
            renderStaffManager();
            render();
          }
        });

        actions.appendChild(configureBtn);
        actions.appendChild(saveBtn);
        actions.appendChild(removeBtn);

        row.appendChild(nameCell);
        row.appendChild(actions);
        row.appendChild(profilePanel);
        staffManagerList.appendChild(row);
      });

      if (!staff.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No team members yet. Add the first team member above.";
        staffManagerList.appendChild(empty);
      }

      applyPermissionGating();
    }

    function addStaff() {
      if (!can("staff.create")) return;
      const firstName = newStaffFirstName.value.trim();
      const lastName = newStaffLastName.value.trim();
      const role = newStaffRole.value.trim();
      const name = [firstName, lastName].filter(Boolean).join(" ").trim();
      const nameInputs = [newStaffFirstName, newStaffLastName];

      if (!name) {
        showFormFeedback(
          nameInputs,
          staffFormFeedback,
          "Enter a first or last name.",
          newStaffFirstName
        );
        return;
      }

      const exists = staff.some(memberName =>
        memberName.toLowerCase() === name.toLowerCase()
      );

      if (exists) {
        showFormFeedback(
          nameInputs,
          staffFormFeedback,
          `A team member named â€œ${name}â€ already exists.`,
          newStaffFirstName
        );
        return;
      }

      clearFormFeedback(nameInputs, staffFormFeedback);
      staff.push(name);
      staffProfiles[name] = {
        firstName,
        lastName,
        role,
        permissionRole: DEFAULT_STAFF_PERMISSION_ROLE
      };

      saveStaff();
      saveStaffProfiles();

      newStaffFirstName.value = "";
      newStaffLastName.value = "";
      newStaffRole.value = "";

      populateStaffFilter();
      populateCurrentUserSelect();
      renderStaffManager();
      render();

      newStaffFirstName.focus();
    }

    // Shared drag state, one slot per reorderable list.
    const reorderState = {
      staff: { dragged: "" },
      project: { dragged: "" },
      orgTeam: { dragged: "" }
    };

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
      scheduleFolderSync();
    }

    function saveTeamLeaders() {
      localStorage.setItem(TEAM_LEADERS_STORAGE_KEY, JSON.stringify(teamLeaders));
      scheduleFolderSync();
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
          <span class="owner-checklist-chevron" aria-hidden="true">âŒ„</span>
        </summary>
        <div class="owner-checklist-menu">
          ${visibleNames.length ? `
            <label class="owner-checklist-option owner-checklist-select-all">
              <input type="checkbox" class="owner-checklist-all"${allSelected ? " checked" : ""}>
              <span>All (${visibleNames.length})</span>
            </label>
          ` : ""}
          ${visibleNames.length ? visibleNames.map(name => {
            const checked = selected.includes(name) ? " checked" : "";
            const suffix = members.includes(name) ? "" : " (not in project)";
            return `
              <label class="owner-checklist-option">
                <input type="checkbox" data-owner value="${escapeHtml(name)}"${checked}>
                <span>${escapeHtml(staffTypeLabel(name) + suffix)}</span>
              </label>
            `;
          }).join("") : '<div class="owner-checklist-empty">No project members assigned</div>'}
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
        allToggle.checked = boxes.length > 0 && selected.length === boxes.length;
        allToggle.indeterminate = selected.length > 0 && selected.length < boxes.length;
      }
    }

    function bindOwnerChecklist(root) {
      ownerCheckboxes(root).forEach(input => {
        input.addEventListener("change", () => refreshOwnerChecklistLabel(root));
      });

      const allToggle = root.querySelector(".owner-checklist-all");
      if (allToggle) {
        allToggle.addEventListener("change", () => {
          ownerCheckboxes(root).forEach(input => {
            input.checked = allToggle.checked;
          });
          refreshOwnerChecklistLabel(root);
        });
      }

      refreshOwnerChecklistLabel(root);
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
        return `${startMonth} ${weekStart.getDate()}, ${weekStart.getFullYear()} â€“ ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      }
      if (weekStart.getMonth() !== weekEnd.getMonth()) {
        return `${startMonth} ${weekStart.getDate()} â€“ ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      }
      return `${startMonth} ${weekStart.getDate()} â€“ ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
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
      scheduleEventDeleteBtn.hidden = isNew || !can("schedule.delete");

      const start = eventStartDate(eventData);
      let end = eventEndDate(eventData);
      if (eventData.allDay) end = addDays(end, -1);
      syncScheduleModalTimeInputs(start, end, scheduleEventAllDay.checked);
      renderScheduleProjectDropdown();
      scheduleEventProject.value = teams.includes(eventData.project) ? eventData.project : "";
      renderScheduleGuestDropdown();
      renderScheduleColorSwatches();
      scheduleModalBackdrop.hidden = false;
      scheduleEventTitle.focus();
    }

    function syncScheduleModalTimeInputs(start, end, allDay) {
      scheduleEventDate.value = formatDisplayDate(start);
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

    function renderScheduleGuestDropdown() {
      scheduleGuestSelect.innerHTML = '<option value="">Add guest...</option>';
      staff.forEach(name => {
        if (scheduleSelectedGuests.includes(name)) return;
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        scheduleGuestSelect.appendChild(option);
      });

      scheduleGuestList.innerHTML = "";
      scheduleSelectedGuests.forEach(name => {
        const chip = document.createElement("span");
        chip.className = "schedule-guest-chip";
        chip.appendChild(document.createTextNode(staffFirstName(name)));
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.setAttribute("aria-label", `Remove ${name}`);
        removeBtn.textContent = "Ã—";
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
    }

    function deleteScheduleModalEvent() {
      if (!scheduleEditingEventId) {
        closeScheduleModal();
        return;
      }
      if (!can("schedule.delete")) return;
      schedule.events = schedule.events.filter(event => event.id !== scheduleEditingEventId);
      saveSchedule();
      closeScheduleModal();
      renderScheduleView();
    }

    function createDraftEvent(start, end, allDay = false) {
      return {
        id: crypto.randomUUID(),
        title: "",
        start: allDay ? toDateKey(start) : toLocalDateTimeValue(start),
        end: allDay ? toDateKey(end) : toLocalDateTimeValue(end),
        allDay,
        description: "",
        location: "",
        project: "",
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
          chip.title = event.title || "(No title)";
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
          block.innerHTML = `
            <span>${escapeHtml(event.title || "(No title)")}</span>
            <span class="schedule-event-time">${escapeHtml(formatEventTime(start))} â€“ ${escapeHtml(formatEventTime(end))}</span>
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
        membersTitle.textContent = `Team members Â· ${orgTeam}`;
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
              memberCell.textContent = String((orgTeamMembers[orgTeam] || []).length);
              render();
            });

            label.appendChild(checkbox);
            label.appendChild(
              document.createTextNode(
                suffixParts.length ? `${staffName} Â· ${suffixParts.join(" Â· ")}` : staffName
              )
            );
            memberOptions.appendChild(label);
          });
        }

        membersPanel.appendChild(memberOptions);

        configureBtn.addEventListener("click", () => {
          membersPanel.hidden = false;
          configureBtn.hidden = true;
          saveBtn.hidden = false;
        });

        saveBtn.addEventListener("click", () => {
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

        removeBtn.addEventListener("click", () => {
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
          `A team named â€œ${name}â€ already exists.`
        );
        return;
      }

      clearFormFeedback([newOrgTeamName], orgTeamFormFeedback);
      orgTeams.push(name);
      orgTeamMembers[name] = [];

      saveOrgTeams();
      saveOrgTeamMembers();
      populateOrgTeamFilter();

      newOrgTeamName.value = "";
      renderOrgTeamManager();
      newOrgTeamName.focus();
    }

    function saveTeams() {
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
      scheduleFolderSync();
    }

    function renderTeamManager() {
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

        saveBtn.addEventListener("click", () => {
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
            save();
            populateTeamFilter();
            renderTeamManager();
            renderScheduleView();
            render();
            return;
          }

          // Membership and Project Leader selections are persisted as they are changed.
          // Save acts as the clear "done configuring" action and closes the panel.
          membersPanel.hidden = true;
          saveBtn.hidden = true;
          membersBtn.hidden = false;
        });

        input.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveBtn.click();
          }
        });

        const membersBtn = document.createElement("button");
        membersBtn.type = "button";
        membersBtn.className = "project-configure-btn";
        membersBtn.textContent = "Configure";
        membersBtn.dataset.permission = "projects.manageMembers";

        const membersPanel = document.createElement("div");
        membersPanel.className = "team-members-panel team-members-table-row";
        membersPanel.hidden = true;

        const membersTitle = document.createElement("div");
        membersTitle.className = "team-members-title";
        membersTitle.textContent = `Project members Â· ${team}`;
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

          const appendProjectMemberOption = (staffName, memberList) => {
            const label = document.createElement("label");
            label.className = "team-member-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = (teamMembers[team] || []).includes(staffName);
            checkbox.dataset.permission = "projects.manageMembers";
            checkbox.dataset.permissionMode = "disable";

            checkbox.addEventListener("change", () => {
              if (!teamMembers[team]) teamMembers[team] = [];

              if (checkbox.checked) {
                if (!teamMembers[team].includes(staffName)) {
                  teamMembers[team].push(staffName);
                }
              } else {
                teamMembers[team] = teamMembers[team].filter(member => member !== staffName);
              }

              if (!checkbox.checked && teamLeaders[team] === staffName) {
                teamLeaders[team] = "";
                saveTeamLeaders();
              }

              saveTeamMembers();
              memberCell.textContent = String((teamMembers[team] || []).length);
              refreshLeaderOptions();
            });

            const profile = staffProfiles[staffName] || { role: "" };
            const memberText = profile.role
              ? `${staffName} Â· ${profile.role}`
              : staffName;

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(memberText));
            memberList.appendChild(label);
          };

          // Group each person once by their complete Team membership. This keeps
          // project checkboxes unambiguous when someone belongs to several Teams.
          const groupedStaff = [];
          staff.forEach(staffName => {
            const memberships = orgTeamsForStaff(staffName);
            const groupName = memberships.length ? memberships.join(" Â· ") : "No Teams";
            let group = groupedStaff.find(item => item.name === groupName);
            if (!group) {
              group = { name: groupName, members: [] };
              groupedStaff.push(group);
            }
            group.members.push(staffName);
          });

          groupedStaff.forEach(group => {
            const groupSection = document.createElement("section");
            groupSection.className = "project-member-group";

            const groupTitle = document.createElement("div");
            groupTitle.className = "project-member-group-title";
            groupTitle.textContent = group.name;

            const memberList = document.createElement("div");
            memberList.className = "project-member-group-list";

            group.members.forEach(staffName => {
              appendProjectMemberOption(staffName, memberList);
            });

            groupSection.appendChild(groupTitle);
            groupSection.appendChild(memberList);
            memberOptions.appendChild(groupSection);
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
          const currentLeader = teamLeaders[team] || "";
          const members = membersForTeam(team);

          leaderSelect.innerHTML = '<option value="">No project leader</option>';

          members.forEach(memberName => {
            const option = document.createElement("option");
            option.value = memberName;
            option.textContent = staffTypeLabel(memberName);
            option.selected = memberName === currentLeader;
            leaderSelect.appendChild(option);
          });

          if (currentLeader && !members.includes(currentLeader)) {
            teamLeaders[team] = "";
            saveTeamLeaders();
            leaderSelect.value = "";
          } else {
            leaderSelect.value = currentLeader;
          }
        }

        refreshLeaderOptions();

        leaderSelect.addEventListener("change", () => {
          const selectedLeader = leaderSelect.value;
          const members = teamMembers[team] || [];

          teamLeaders[team] = selectedLeader && members.includes(selectedLeader)
            ? selectedLeader
            : "";

          saveTeamLeaders();
        });

        leaderRow.appendChild(leaderLabel);
        leaderRow.appendChild(leaderSelect);
        membersPanel.appendChild(leaderRow);

        membersBtn.addEventListener("click", () => {
          membersPanel.hidden = false;
          membersBtn.hidden = true;
          saveBtn.hidden = false;
        });

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger-btn";
        removeBtn.textContent = "Remove";
        removeBtn.dataset.permission = "projects.delete";

        let removeArmed = false;
        let removeResetTimer = null;

        removeBtn.addEventListener("click", () => {
          const assignedTasks = tasks.filter(t => t.team === team);

          if (!removeArmed) {
            removeArmed = true;
            removeBtn.textContent = assignedTasks.length > 0
              ? `Confirm Â· move ${assignedTasks.length}`
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
            }

            tasks = tasks.map(task =>
              task.team === team ? { ...task, team: "Unassigned" } : task
            );
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
            populateTeamFilter();
            renderTeamManager();
            render();
          }
        });

        actions.appendChild(saveBtn);
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
          `A project named â€œ${name}â€ already exists.`
        );
        return;
      }

      clearFormFeedback([newTeamName], projectFormFeedback);
      teams.push(name);
      teamMembers[name] = [];
      teamLeaders[name] = "";
      saveTeams();
      saveTeamMembers();
      saveTeamLeaders();
      newTeamName.value = "";
      populateTeamFilter();
      renderTeamManager();
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
      if (!staff.includes(currentUserName)) currentUserName = staff[0] || "";

      currentUserSelect.innerHTML = staff.map(name =>
        `<option value="${escapeHtml(name)}"${name === currentUserName ? " selected" : ""}>${escapeHtml(name)}</option>`
      ).join("");
    }

    function onCurrentUserChanged() {
      updateSidebarBrandMark();
      applyPermissionGating();
    }

    currentUserSelect.addEventListener("change", () => {
      currentUserName = currentUserSelect.value;
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, currentUserName);
      onCurrentUserChanged();
    });

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
              ? `<span class="task-update-time task-update-today">Updated Today Â· ${escapeHtml(hoursAgoLabel(update.createdAt))}</span>`
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

    function render() {
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
                ${currentFilter === "All" ? "disabled" : ""}
                title="${currentFilter === "All" ? "Select a specific project to add tasks" : "Add task to " + status}"
              >+ Add</button>
            </div>
            <div class="count">${inColumn.length}</div>
          </div>

          <div class="inline-editor" data-editor-status="${status}">
            <div class="inline-editor-inner">
              <div class="inline-editor-panel">
                <div class="inline-editor-title">New task Â· ${displayStatusLabel(status)}</div>
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
                  <button type="button" class="btn-primary inline-save">Save Task</button>
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
          editorTitle.textContent = `New task Â· ${status}`;
        }

        function openInlineEditor(task = null) {
          if (currentFilter === "All" && !task) {
            alert("Select a specific project from the project dropdown first.");
            return;
          }

          if (task) {
            idInput.value = task.id;
            titleInput.value = task.title || "";
            descriptionInput.value = task.description || "";
            setOwnerChecklist(ownerInput, task.team || currentFilter, taskOwners(task));
            priorityInput.value = task.priority === "High" ? "High" : "Low";
            dueInput.value = task.due || "";
            editorTitle.textContent = `Edit task Â· ${status}`;
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
          if (editor.classList.contains("open") && !idInput.value) {
            closeInlineEditor();
          } else {
            openInlineEditor();
          }
        });

        cancelInlineBtn.addEventListener("click", closeInlineEditor);

        saveInlineBtn.addEventListener("click", () => {
          const title = titleInput.value.trim();
          if (!title) {
            titleInput.focus();
            return;
          }

          const editingId = idInput.value;
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
          } else {
            tasks.push(data);
          }

          save();
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
                      <button type="button" class="btn-primary task-update-save">Save</button>
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
                  ${(isCompletedTask || !canEditTasks) ? "" : '<button class="icon-btn edit-btn" type="button">Edit</button>'}
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
                      save();
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
                    save();

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
                    save();
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
                      save();
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

              save();
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
              renderTaskCardEditor();
            });

            deleteBtn.addEventListener("click", e => {
              e.preventDefault();
              e.stopPropagation();
              card.draggable = false;

              if (isCompletedTask) {
                archivedTasks.push({
                  ...task,
                  archivedId: crypto.randomUUID(),
                  archivedAt: new Date().toISOString()
                });

                tasks = tasks.filter(t => t.id !== task.id);
                save();
                saveArchivedTasks();
                render();
                return;
              }

              deletedTasks.push({
                ...task,
                trashId: crypto.randomUUID(),
                previousStatus: task.status,
                deletedAt: new Date().toISOString()
              });

              tasks = tasks.filter(t => t.id !== task.id);
              save();
              saveTrash();
              render();
            });
          }

          function renderTaskCardEditor() {
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

              save();
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
            save();
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
          save();
          render();

          if (!wasCompleted && status === "Done") celebrateTaskCompletion(draggedId);
        });

        board.appendChild(column);
      });

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
      if (!confirm("Reset all roles to the default permission matrix? This cannot be undone.")) return;
      permissionMatrix = structuredClone(DEFAULT_PERMISSION_MATRIX);
      savePermissionMatrix();
      renderSettingsView();
      applyPermissionGating();
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

    // Sweeps every element carrying data-permission="<actionId>" and hides
    // (default) or disables (data-permission-mode="disable") it based on
    // can(actionId). Only ever ADDS hidden/disabled â€” it never re-enables
    // something a render function already disabled for an unrelated reason
    // (e.g. the "add task" button being disabled when no project is picked).
    function applyPermissionGating(root = document) {
      root.querySelectorAll("[data-permission]").forEach(el => {
        const allowed = can(el.dataset.permission);
        if (el.dataset.permissionMode === "disable") {
          if (!allowed) el.disabled = true;
          el.classList.toggle("permission-disabled", !allowed);
        } else {
          el.hidden = !allowed;
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

      [tasksNavBtn, orgTeamsNavBtn, staffNavBtn, teamsNavBtn, scheduleNavBtn, completedTasksNavBtn, trashNavBtn, sidebarBrandMark]
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

    document.getElementById("manageStaffBtn").addEventListener("click", () => {
      switchWorkspaceView("staff");
    });

    document.getElementById("addStaffBtn").addEventListener("click", addStaff);

    [newStaffFirstName, newStaffLastName].forEach(input => {
      input.addEventListener("input", () => {
        clearFormFeedback([newStaffFirstName, newStaffLastName], staffFormFeedback);
      });
    });

    [newStaffFirstName, newStaffLastName, newStaffRole].forEach(input => {
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          addStaff();
        }
      });
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
    scheduleEventAllDay.addEventListener("change", () => {
      const date = parseDisplayDate(scheduleEventDate.value) || new Date();
      const start = applyTimeToDate(date, scheduleEventStartTime.value || "09:00");
      let end = applyTimeToDate(date, scheduleEventEndTime.value || "10:00");
      if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
      syncScheduleModalTimeInputs(start, end, scheduleEventAllDay.checked);
    });

    scheduleEventDate.addEventListener("blur", () => {
      const date = parseDisplayDate(scheduleEventDate.value);
      if (date) scheduleEventDate.value = formatDisplayDate(date);
    });

    document.addEventListener("keydown", event => {
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
    populateCurrentUserSelect();
    save();
    saveTrash();
    saveArchivedTasks();
    saveStaff();
    saveStaffProfiles();
    saveOrgTeams();
    saveOrgTeamMembers();
    saveTeamMembers();
    saveTeamLeaders();
    render();
    updateSidebarBrandMark();
    applyPermissionGating();
    switchWorkspaceView("tasks");
    initializeFolderPersistence();

