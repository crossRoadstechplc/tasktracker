function Bone({ className = "" }: { className?: string }) {
  return <div className={`tracker-skel-bone ${className}`.trim()} aria-hidden="true" />;
}

function BoardColumn({ cards }: { cards: number }) {
  return (
    <div className="tracker-skel-column">
      <div className="tracker-skel-column-head">
        <Bone className="tracker-skel-w-24" />
        <Bone className="tracker-skel-pill" />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="tracker-skel-card">
          <Bone className="tracker-skel-w-70" />
          <Bone className="tracker-skel-w-45" />
          <div className="tracker-skel-card-meta">
            <Bone className="tracker-skel-avatar" />
            <Bone className="tracker-skel-w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrackerSkeleton() {
  return (
    <div className="tracker-skel app-shell" role="status" aria-live="polite" aria-busy="true" aria-label="Loading task tracker">
      <aside className="tracker-skel-sidebar" aria-hidden="true">
        <div className="tracker-skel-sidebar-brand">
          <Bone className="tracker-skel-brand-mark" />
          <div className="tracker-skel-brand-text">
            <Bone className="tracker-skel-w-28" />
            <Bone className="tracker-skel-w-20" />
          </div>
        </div>
        <div className="tracker-skel-nav">
          <Bone className="tracker-skel-nav-label" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={`work-${i}`} className="tracker-skel-nav-item" />
          ))}
          <Bone className="tracker-skel-nav-label" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={`org-${i}`} className="tracker-skel-nav-item" />
          ))}
        </div>
      </aside>

      <div className="tracker-skel-content">
        <header className="tracker-skel-header" aria-hidden="true">
          <div className="tracker-skel-header-left">
            <Bone className="tracker-skel-w-48 tracker-skel-h-7" />
            <Bone className="tracker-skel-w-64 tracker-skel-h-4" />
          </div>
          <div className="tracker-skel-header-right">
            <Bone className="tracker-skel-filter" />
            <Bone className="tracker-skel-filter" />
            <Bone className="tracker-skel-filter" />
          </div>
        </header>

        <div className="tracker-skel-board" aria-hidden="true">
          <BoardColumn cards={3} />
          <BoardColumn cards={2} />
          <BoardColumn cards={4} />
          <BoardColumn cards={2} />
        </div>
      </div>
    </div>
  );
}
