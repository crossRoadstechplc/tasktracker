import type { PermissionRoleLabel } from "@/src/types/workspace";

export type AuthStaffMember = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  permissionRole: PermissionRoleLabel;
};

export type AuthUserResponse = {
  user: {
    id: string;
    email: string;
  };
  staffMember: AuthStaffMember;
};
