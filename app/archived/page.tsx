import { TrackerApp } from "@/src/components/TrackerApp";
import type { TrackerWorkspaceView } from "@/src/tracker/tracker-routes";

const view: TrackerWorkspaceView = "archived";

export default function ArchivedTasksPage() {
  return <TrackerApp initialView={view} />;
}
