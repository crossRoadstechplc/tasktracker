// Shell markup for the tracker workspace (aligned with admin portal chrome).
export const TRACKER_SHELL_HTML = `
  <div class="app-shell">
    <aside class="app-sidebar" id="appSidebar">
      <div class="sidebar-top">
        <div class="sidebar-brand">
          <button class="sidebar-brand-mark" id="sidebarBrandMark" type="button" aria-label="Task Tracker" data-permission="settings.editPermissions" data-permission-mode="disable">
            <span class="sidebar-brand-mark-letter">T</span>
            <svg class="sidebar-brand-mark-cog" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
          <div class="sidebar-brand-text">
            <strong>Task Tracker</strong>
            <span>Workspace</span>
          </div>
        </div>

        <button class="sidebar-collapse-btn" id="sidebarCollapseBtn" type="button" aria-label="Collapse sidebar" title="Collapse sidebar">
          <svg class="sidebar-collapse-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 6.5 10 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <nav class="sidebar-nav" aria-label="Workspace tools">
        <div class="sidebar-nav-group">
          <p class="sidebar-nav-group-label">Work</p>
          <button class="sidebar-nav-item active" id="tasksNavBtn" type="button">
            <span class="sidebar-icon"><svg class="sidebar-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12.5l4 4L19 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg></span>
            <span class="sidebar-label">Tasks</span>
          </button>

          <button class="sidebar-nav-item" id="scheduleNavBtn" type="button">
            <span class="sidebar-icon"><svg class="sidebar-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <path d="M8 3.5v3M16 3.5v3M4 9.5h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <rect x="8" y="12" width="3" height="3" rx=".6" fill="currentColor"/>
            </svg></span>
            <span class="sidebar-label">Schedule</span>
          </button>

          <button class="sidebar-nav-item" id="completedTasksBtn" type="button">
            <span class="sidebar-icon"><svg class="sidebar-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <path d="M8.5 12.3l2.4 2.4 4.6-5.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg></span>
            <span class="sidebar-label">Completed Tasks</span>
            <span class="sidebar-count" id="archivedCount">0</span>
          </button>
        </div>

        <div class="sidebar-nav-group">
          <p class="sidebar-nav-group-label">Organization</p>
          <button class="sidebar-nav-item" id="manageOrgTeamsBtn" type="button">
            <span class="sidebar-icon"><svg class="sidebar-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="16" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <path d="M3.8 17c.5-2.7 2-4.1 4.2-4.1s3.7 1.4 4.2 4.1M11.8 17c.5-2.7 2-4.1 4.2-4.1s3.7 1.4 4.2 4.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg></span>
            <span class="sidebar-label">Teams</span>
          </button>

          <button class="sidebar-nav-item" id="manageStaffBtn" type="button">
            <span class="sidebar-icon"><svg class="sidebar-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>
              <path d="M6.5 18c.7-3.1 2.6-4.7 5.5-4.7s4.8 1.6 5.5 4.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg></span>
            <span class="sidebar-label">Team Members</span>
          </button>

          <button class="sidebar-nav-item" id="manageTeamsBtn" type="button">
            <span class="sidebar-icon">
            <svg class="sidebar-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="12" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/>
              <path d="M9 5.5V4.7A1.7 1.7 0 0 1 10.7 3h2.6A1.7 1.7 0 0 1 15 4.7v.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
              <path d="M9 9h6M9 12h6M9 15h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
</span>
            <span class="sidebar-label">Projects</span>
          </button>
        </div>

        <div class="sidebar-nav-group">
          <p class="sidebar-nav-group-label">System</p>
          <button class="sidebar-nav-item" id="trashBtn" type="button">
            <span class="sidebar-icon"><svg class="sidebar-svg-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 9v8M12 9v8M16 9v8M5 6h14M9 6l1-2h4l1 2M7 6l1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg></span>
            <span class="sidebar-label">Deleted Tasks</span>
            <span class="sidebar-count" id="trashCount">0</span>
          </button>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-current-user">
          <span class="sidebar-current-user-label">Signed in as</span>
          <select id="currentUserSelect" aria-label="Signed in as"></select>
        </div>
        <div class="sidebar-data-actions">
          <button class="sidebar-data-btn" id="exportDataBtn" type="button" data-permission="backup.export">
            <svg class="sidebar-data-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12"></path>
              <path d="m8 11 4 4 4-4"></path>
              <path d="M5 20h14"></path>
            </svg>
            <span>Export backup</span>
          </button>
          <button class="sidebar-data-btn" id="importDataBtn" type="button" data-permission="backup.import">
            <svg class="sidebar-data-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 16V4"></path>
              <path d="m8 8 4-4 4 4"></path>
              <path d="M5 20h14"></path>
            </svg>
            <span>Import backup</span>
          </button>
          <input id="importDataInput" type="file" accept=".json,application/json" hidden>
        </div>
        <div class="backup-status" id="backupStatus" role="status" aria-live="polite"></div>
        <span class="sidebar-footer-meta">Task Tracker · v1.0</span>
      </div>
    </aside>

    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>

    <div class="app-content">
  <header class="main-header">
    <div class="header-left">
      <button class="mobile-sidebar-btn" id="mobileSidebarBtn" type="button" aria-label="Open sidebar" title="Open sidebar">
        <span aria-hidden="true">☰</span>
      </button>

      <div class="brand">
        <h1 id="workspaceTitle">Company Task Tracker</h1>
        <p id="workspaceSubtitle">Combine project, team, and team member filters, then manage tasks by status</p>
      </div>
    </div>

    <div class="header-right">
      <div class="header-actions">
        <div class="notification-center">
        <button class="notification-btn" id="notificationBtn" type="button" aria-label="Notifications" aria-expanded="false" aria-haspopup="true" title="Notifications">
          <svg class="notification-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22a2.4 2.4 0 0 0 2.3-1.8H9.7A2.4 2.4 0 0 0 12 22Z" fill="currentColor"/>
            <path d="M18 10.5c0-3.3-2.1-6.1-5.1-7.1V2.5a1 1 0 1 0-2 0v.9C7.9 4.4 5.8 7.2 5.8 10.5v4.1L4 16.9V17h16v-.1l-1.8-2.3v-4.1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          </svg>
          <span class="notification-count" id="notificationCount" hidden>0</span>
        </button>
        <div class="notification-dropdown" id="notificationDropdown" hidden role="menu" aria-label="Notifications">
          <div class="notification-dropdown-header">
            <strong>Notifications</strong>
            <button class="notification-mark-all" id="notificationMarkAllBtn" type="button">Mark all read</button>
          </div>
          <div class="notification-list" id="notificationList">
            <p class="notification-empty">No notifications yet.</p>
          </div>
        </div>
      </div>

      <div class="toolbar" id="taskFilters">
      <select id="teamFilter" title="Filter by project">
        <option value="All">All Projects</option>
      </select>

      <select id="orgTeamFilter" title="Filter by team">
        <option value="All">All Teams</option>
      </select>

      <select id="staffFilter" title="Filter by team member">
        <option value="All">All Team Members</option>
      </select>

      <button class="filter-clear-btn" id="clearFiltersBtn" type="button" hidden>Clear filters</button>
      </div>
      </div>
    </div>
  </header>

  <main class="workspace-main">
    <section class="workspace-view active" id="tasksView">
<div class="board-wrap">
        <div class="board" id="board"></div>
      </div>
    </section>

    <section class="workspace-view management-page" id="orgTeamsView">
      <div class="workspace-section-header">
        <div>
          <h2>Teams</h2>
          <p>Organize Team Members across one or more teams. Project participation remains independent.</p>
        </div>
      </div>

      <div class="management-toolbar" data-permission="teams.create">
        <input id="newOrgTeamName" placeholder="e.g. Operations, Finance, Engineering">
        <button type="button" class="btn-primary" id="addOrgTeamBtn" data-permission="teams.create">Add Team</button>
      </div>
      <div class="form-feedback" id="orgTeamFormFeedback" role="status" aria-live="polite"></div>

      <div class="team-manager team-table org-team-manager management-list" id="orgTeamManagerList"></div>
    </section>

    <section class="workspace-view management-page" id="staffView">
      <div class="workspace-section-header">
        <div>
          <h2>Team Members</h2>
          <p>Add, rename, or remove team members. Task assignment dropdowns update automatically.</p>
        </div>
      </div>

      <div class="management-toolbar add-team-member-toolbar" data-permission="staff.create">
        <label class="add-team-member-field">
          <span>First Name</span>
          <input id="newStaffFirstName" placeholder="e.g. Hana" autocomplete="off">
        </label>

        <label class="add-team-member-field">
          <span>Last Name</span>
          <input id="newStaffLastName" placeholder="e.g. Bekele" autocomplete="off">
        </label>

        <label class="add-team-member-field">
          <span>Email</span>
          <input id="newStaffEmail" type="email" placeholder="e.g. hana@company.com" autocomplete="off">
        </label>

        <label class="add-team-member-field">
          <span>Job Title</span>
          <input id="newStaffRole" placeholder="e.g. Operations Lead" autocomplete="off">
        </label>

        <label class="add-team-member-field">
          <span>Permission Role</span>
          <select id="newStaffPermissionRole" aria-label="Permission Role">
            <option value="Junior Staff" selected>Junior Staff</option>
            <option value="Senior Staff">Senior Staff</option>
            <option value="Lead">Lead</option>
            <option value="Admin">Admin</option>
            <option value="Super Admin">Super Admin</option>
          </select>
        </label>

        <button type="button" class="btn-primary add-team-member-btn" id="addStaffBtn" data-permission="staff.create">Invite &amp; Add</button>
      </div>
      <div class="form-feedback" id="staffFormFeedback" role="status" aria-live="polite"></div>

      <div class="staff-manager management-list" id="staffManagerList"></div>
    </section>

    <section class="workspace-view management-page" id="teamsView">
      <div class="workspace-section-header">
        <div>
          <h2>Projects</h2>
          <p>Add, rename, or remove projects and control which team members belong to each project.</p>
        </div>
      </div>

      <div class="management-toolbar" data-permission="projects.create">
        <input id="newTeamName" placeholder="e.g. Website Redesign, Q4 Launch, Expansion">
        <button type="button" class="btn-primary" id="addTeamBtn" data-permission="projects.create">Add Project</button>
      </div>
      <div class="form-feedback" id="projectFormFeedback" role="status" aria-live="polite"></div>

      <div class="team-manager management-list" id="teamManagerList"></div>
    </section>

    <section class="workspace-view management-page" id="scheduleView">
      <div class="schedule-toolbar">
        <div class="schedule-toolbar-left">
          <button type="button" class="btn-secondary" id="scheduleTodayBtn">Today</button>
          <div class="schedule-nav-arrows">
            <button type="button" class="schedule-nav-btn prev" id="schedulePrevBtn" aria-label="Previous week">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5.5 8.5 12 15 18.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button type="button" class="schedule-nav-btn next" id="scheduleNextBtn" aria-label="Next week">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5 15.5 12 9 18.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <h2 class="schedule-range-title" id="scheduleRangeTitle">Week</h2>
        </div>
        <div class="schedule-toolbar-right">
          <span class="schedule-view-label">Week</span>
          <button type="button" class="btn-primary" id="scheduleCreateBtn" data-permission="schedule.create">Create</button>
        </div>
      </div>

      <div class="toolbar schedule-filters" id="scheduleFilters">
        <select id="scheduleProjectFilter" title="Filter by project">
          <option value="All">All Projects</option>
        </select>

        <select id="scheduleOrgTeamFilter" title="Filter by team">
          <option value="All">All Teams</option>
        </select>

        <button class="filter-clear-btn" id="scheduleClearFiltersBtn" type="button" hidden>Clear filters</button>
      </div>

      <div class="schedule-calendar" id="scheduleCalendar">
        <div class="schedule-allday" id="scheduleAllDay"></div>
        <div class="schedule-timed-scroll" id="scheduleTimedScroll">
          <div class="schedule-timed" id="scheduleTimed"></div>
        </div>
      </div>

      <div class="schedule-modal-backdrop" id="scheduleModalBackdrop" hidden>
        <div class="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="scheduleModalTitle">
          <div class="schedule-modal-header">
            <h3 id="scheduleModalTitle">Event</h3>
            <button type="button" class="schedule-modal-close" id="scheduleModalClose" aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="schedule-modal-body">
            <label class="schedule-field">
              <span>Title</span>
              <input id="scheduleEventTitle" type="text" placeholder="Add title" autocomplete="off">
            </label>
            <label class="schedule-field schedule-check-field">
              <input id="scheduleEventAllDay" type="checkbox">
              <span>All day</span>
            </label>
            <div class="schedule-field-row schedule-datetime-row" id="scheduleDateTimeRow">
              <label class="schedule-field schedule-date-field">
                <span>Date</span>
                <div class="schedule-date-input-row">
                  <input id="scheduleEventDate" type="text" placeholder="21-Aug-2026" autocomplete="off" spellcheck="false">
                  <button type="button" class="schedule-date-picker-btn" id="scheduleEventDatePickerBtn" aria-label="Pick date" title="Pick date">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5v2M17 3.5v2M4.5 8.5h15M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  </button>
                  <input id="scheduleEventDatePicker" type="date" class="schedule-date-picker-native" tabindex="-1" aria-hidden="true">
                </div>
              </label>
              <label class="schedule-field" id="scheduleStartTimeField">
                <span>Start time</span>
                <input id="scheduleEventStartTime" type="time" step="900">
              </label>
              <label class="schedule-field" id="scheduleEndTimeField">
                <span>End time</span>
                <input id="scheduleEventEndTime" type="time" step="900">
              </label>
            </div>
            <label class="schedule-field">
              <span>Location</span>
              <input id="scheduleEventLocation" type="text" placeholder="Add location" autocomplete="off">
            </label>
            <div class="schedule-form-section" id="scheduleProjectSection">
              <label class="schedule-field">
                <span>Project (optional)</span>
                <select id="scheduleEventProject">
                  <option value="">No project</option>
                </select>
              </label>
              <p class="schedule-field-helper" id="scheduleProjectHelper">Leave blank for a personal event visible only to invited guests.</p>
              <div class="schedule-project-team-preview" id="scheduleProjectTeamPreview" hidden>
                <span class="schedule-project-team-label">Project team</span>
                <ul class="schedule-project-team-list" id="scheduleProjectTeamList"></ul>
              </div>
            </div>
            <label class="schedule-field">
              <span>Description</span>
              <textarea id="scheduleEventDescription" rows="3" placeholder="Add description"></textarea>
            </label>
            <div class="schedule-form-section" id="scheduleGuestSection">
              <div class="schedule-field">
                <span>Invite guests (optional)</span>
                <p class="schedule-field-helper" id="scheduleGuestHelper">Only invited guests can see this event.</p>
                <select id="scheduleGuestSelect" class="schedule-guest-dropdown">
                  <option value="">Add guest...</option>
                </select>
                <div class="schedule-guest-chips" id="scheduleGuestList"></div>
              </div>
            </div>
            <label class="schedule-field">
              <span>Color</span>
              <div class="schedule-color-row" id="scheduleColorRow"></div>
            </label>
          </div>
          <div class="schedule-modal-actions">
            <button type="button" class="danger-btn" id="scheduleEventDeleteBtn" data-permission="schedule.delete">Delete</button>
            <div class="schedule-modal-actions-right">
              <button type="button" class="btn-secondary" id="scheduleEventCancelBtn">Cancel</button>
              <button type="button" class="btn-primary" id="scheduleEventSaveBtn" data-permission="schedule.create" data-permission-mode="disable">Save</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="workspace-view management-page" id="completedTasksView">
      <div class="workspace-section-header">
        <div>
          <h2>Completed Tasks</h2>
          <p>A permanent log of every task that's been finished and archived off the board.</p>
        </div>
      </div>

      <div class="trash-list management-list" id="completedTasksList"></div>
    </section>

    <section class="workspace-view management-page" id="trashView">
      <div class="workspace-section-header">
        <div>
          <h2>Deleted Tasks</h2>
          <p>Deleted tasks are retained for accountability and can be restored to their previous status.</p>
        </div>
      </div>

      <div class="trash-list management-list" id="trashList"></div>
    </section>

    <section class="workspace-view management-page" id="settingsView">
      <div class="workspace-section-header">
        <div>
          <h2>Permissions &amp; Access</h2>
          <p>Control what each role can do. Super Admin always has full access and cannot be edited.</p>
        </div>
      </div>

      <div class="permission-matrix-actions">
        <p class="permission-save-status" id="permissionSaveStatus" role="status" aria-live="polite"></p>
        <div class="permission-matrix-actions-buttons">
          <button type="button" class="btn-secondary" id="resetPermissionsBtn" data-permission="settings.editPermissions">Reset to Defaults</button>
          <button type="button" class="btn-primary" id="savePermissionsBtn" data-permission="settings.editPermissions" disabled>Save Permissions</button>
        </div>
      </div>

      <div class="permission-matrix-wrap" id="permissionMatrixWrap"></div>
    </section>
  </main>
    </div>
  </div>
`;
