export type TrackerWorkspaceView =
  | "tasks"
  | "orgTeams"
  | "staff"
  | "teams"
  | "schedule"
  | "completedTasks"
  | "archived"
  | "ongoing"
  | "trash"
  | "settings";

export const TRACKER_VIEW_PATHS: Record<TrackerWorkspaceView, string> = {
  tasks: "/",
  orgTeams: "/teams-org",
  staff: "/staff",
  teams: "/projects",
  schedule: "/schedule",
  completedTasks: "/completed",
  archived: "/archived",
  ongoing: "/ongoing",
  trash: "/trash",
  settings: "/settings",
};

export function trackerViewFromPathname(pathname: string): TrackerWorkspaceView {
  const path = pathname.replace(/\/+$/, "") || "/";
  const entry = Object.entries(TRACKER_VIEW_PATHS).find(([, url]) => url === path);
  return (entry?.[0] as TrackerWorkspaceView | undefined) ?? "tasks";
}
