type TaskOpsSplashProps = {
  label?: string;
};

export function TaskOpsSplash({ label = "Opening your workspace…" }: TaskOpsSplashProps) {
  return (
    <div className="task-ops-splash" role="status" aria-live="polite" aria-busy="true">
      <div className="task-ops-splash-glow" aria-hidden="true" />
      <div className="task-ops-splash-card">
        <div className="task-ops-splash-mark" aria-hidden="true">
          <span>T</span>
        </div>
        <p className="task-ops-splash-eyebrow">Task Operations</p>
        <h1 className="task-ops-splash-title">Plan, assign, and track work</h1>
        <p className="task-ops-splash-copy">
          Boards, schedules, and team updates — synced with your workforce admin session.
        </p>

        <div className="task-ops-splash-orbit" aria-hidden="true">
          <span className="task-ops-splash-chip task-ops-splash-chip-a">Tasks</span>
          <span className="task-ops-splash-chip task-ops-splash-chip-b">Teams</span>
          <span className="task-ops-splash-chip task-ops-splash-chip-c">Schedule</span>
        </div>

        <div className="task-ops-splash-progress" aria-hidden="true">
          <span className="task-ops-splash-progress-bar" />
        </div>
        <p className="task-ops-splash-label">{label}</p>
      </div>
    </div>
  );
}
