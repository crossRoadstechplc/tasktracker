export function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loader-spinner" aria-hidden="true" />
      <p className="page-loader-label">Loading task tracker</p>
    </div>
  );
}
