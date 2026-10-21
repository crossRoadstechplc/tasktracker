import { TrackerApp } from "@/src/components/TrackerApp";
import type { TrackerWorkspaceView } from "@/src/tracker/tracker-routes";

const view: TrackerWorkspaceView = "completedTasks";

export default function CompletedTasksPage() {
  return <TrackerApp initialView={view} />;
}
