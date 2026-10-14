from pathlib import Path

path = Path(__file__).resolve().parent / "src" / "tracker" / "tracker-app.ts"
text = path.read_text(encoding="utf-8")
start = text.index("      function renderStaffManager() {")
end = text.index("\n      function attachRowReorder({ row, handle, container, value, state, getList")

new_fn = r'''      function renderStaffManager() {
        staffManagerList.innerHTML = "";
        staffManagerList.classList.add("staff-table", "staff-directory-table");

        const header = document.createElement("div");
        header.className = "staff-table-header";
        header.innerHTML = `
          <div>Name</div>
          <div>Email</div>
          <div>Job Title</div>
          <div>Department</div>
          <div>Office</div>
          <div>Workforce Role</div>
          <div>Permission Role</div>
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
            return el;
          }

          const nameCell = document.createElement("div");
          nameCell.className = "staff-cell staff-name-cell";
          const nameWrap = document.createElement("div");
          nameWrap.className = "staff-display-wrap";
          const displayName = document.createElement("div");
          displayName.className = "staff-display-name";
          displayName.textContent = name;
          const meta = document.createElement("div");
          meta.className = "staff-display-role";
          const code = profile.employeeCode ? `Code ${profile.employeeCode}` : "";
          meta.textContent = [code, staffMetaLabel(name)].filter(Boolean).join(" · ");
          nameWrap.appendChild(displayName);
          nameWrap.appendChild(meta);
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
          empty.textContent = "No Workforce people synced yet. Enable Task Operations and ensure employees exist in Workforce.";
          staffManagerList.appendChild(empty);
        }

        applyPermissionGating();
      }

'''

path.write_text(text[:start] + new_fn + text[end:], encoding="utf-8")
print("ok", end - start, "->", len(new_fn))
