export default function AnimatedLoadingLabel({ label }) {
  return (
    <span className="animated-loading-label">
      <span>{label.replace(/[.…]+$/, "")}</span>
      <span className="loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
    </span>
  );
}
