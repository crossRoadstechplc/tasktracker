type PageLoaderProps = {
  label?: string;
};

export function PageLoader({ label = "Loading task tracker" }: PageLoaderProps) {
  return (
    <div className="page-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loader-spinner" aria-hidden="true" />
      <p className="page-loader-label">{label}</p>
    </div>
  );
}
