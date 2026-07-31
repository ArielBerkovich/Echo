import { memo } from "react";
import {
  CircleCheckIcon,
  CircleMinusIcon,
  CircleXIcon,
  Clock3Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import jenkinsAvatar from "../assets/jenkins-headshot.png";

const STATUS_DETAILS = {
  success: { label: "Passed", Icon: CircleCheckIcon, result: "All checks passed" },
  failed: { label: "Failed", Icon: CircleXIcon, result: "Build failed" },
  warning: { label: "Unstable", Icon: TriangleAlertIcon, result: "Review required" },
  cancelled: { label: "Cancelled", Icon: CircleMinusIcon, result: "Build cancelled" },
  skipped: { label: "Skipped", Icon: CircleMinusIcon, result: "Build skipped" },
  running: { label: "Running", Icon: Clock3Icon, result: "Build in progress" },
};

function normalizeMention(value) {
  return String(value || "").trim().replace(/^@/, "");
}

export function JenkinsAvatar({ size = 36 }) {
  return (
    <img
      className="jenkins-avatar"
      src={jenkinsAvatar}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
    />
  );
}

function JenkinsBuildCard({ report }) {
  const status = report.status || "running";
  const statusDetails = STATUS_DETAILS[status] || STATUS_DETAILS.running;
  const StatusIcon = statusDetails.Icon;
  const stages = Array.isArray(report.stages) ? report.stages : [];
  const failedStages = stages
    .filter((stage) => stage.status === "failed")
    .map((stage) => stage.name)
    .filter(Boolean);
  const warningStages = stages
    .filter((stage) => stage.status === "warning")
    .map((stage) => stage.name)
    .filter(Boolean);
  const attentionStages = failedStages.length ? failedStages : warningStages;
  const attentionLabel = failedStages.length ? "Failed stage" : "Attention stage";
  const relevantPerson = normalizeMention(report.relevantPerson);
  const outcome = attentionStages.join(", ") || statusDetails.result;

  return (
    <section
      className={`jenkins-build-card jenkins-build-card--${status}`}
      data-testid="jenkins-build-card"
    >
      <header className="jenkins-build-heading">
        <div className="jenkins-build-primary">
          <span className="jenkins-build-status-icon" aria-hidden="true">
            <StatusIcon size={18} strokeWidth={1.8} />
          </span>
          <div>
            <h3 className="jenkins-build-title">{report.jobName}</h3>
            <div className="jenkins-build-context">
              <span>Build #{report.buildNumber}</span>
              <i aria-hidden="true" />
              <span className={report.branch ? "" : "jenkins-value-muted"}>
                <GitBranchIcon aria-hidden="true" size={12} strokeWidth={1.8} />
                {report.branch || "Branch unavailable"}
              </span>
            </div>
          </div>
        </div>
        <div className="jenkins-build-actions">
          <span className="jenkins-build-status-pill">{statusDetails.label}</span>
          {report.buildUrl ? (
            <a className="jenkins-build-link" href={report.buildUrl} target="_blank" rel="noreferrer">
              View build
              <ExternalLinkIcon aria-hidden="true" size={12} strokeWidth={1.8} />
            </a>
          ) : null}
        </div>
      </header>

      <div className="jenkins-build-outcome">
        <div>
          <span>{attentionStages.length ? attentionLabel : "Result"}</span>
          <strong>{outcome}</strong>
        </div>
        <div className={`jenkins-build-owner ${relevantPerson ? "" : "jenkins-build-owner--empty"}`}>
          <strong>{relevantPerson ? `@${relevantPerson}` : "Not assigned"}</strong>
        </div>
      </div>
    </section>
  );
}

export default memo(JenkinsBuildCard);
