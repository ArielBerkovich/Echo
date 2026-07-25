/**
 * Markdown message renderers for Azure DevOps webhook notifications.
 *
 * All functions return a plain Markdown string that can be passed directly to
 * deliverMessage() / postAutomationMessage().  No HTML — Echo's client renders
 * the message body as Markdown.
 */

/** Result of the optional ADO build-timeline enrichment API call. */
export interface BuildFailureDetail {
  failedJobName?: string;
  failedStepName?: string;
  logUrl?: string;
}

/** Subset of an ADO build.complete resource relevant to rendering. */
export interface BuildResource {
  id: number;
  buildNumber: string;
  url: string;
  definition: { name: string };
  repository: { name: string };
  triggerInfo?: { "pr.number"?: string; "pr.title"?: string };
  requestedBy: { displayName: string; uniqueName: string };
  requestedFor: { displayName: string; uniqueName: string };
}

/** Subset of an ADO git.pullrequest.* resource relevant to rendering. */
export interface PullRequestResource {
  pullRequestId: number;
  title: string;
  url: string;
  repository: { name: string; project?: { name: string } };
  createdBy: { displayName: string; uniqueName: string };
  reviewers?: Array<{ displayName: string; vote: number }>;
  closedDate?: string;
}

/** Subset of a single ADO comment entry for rendering. */
export interface CommentEntry {
  authorDisplayName: string;
  content: string;
}

// ---------------------------------------------------------------------------
// PR Validation Pipeline Failed
// ---------------------------------------------------------------------------

/**
 * Render a DM notification for a failed pull-request validation pipeline.
 *
 * The message always includes repository, PR reference, and pipeline name.
 * If `detail` is provided (optional ADO Timeline API enrichment), the failed
 * job/step name and a log link are also included.
 */
export function renderPRValidationFailed(
  resource: BuildResource,
  detail: BuildFailureDetail | null
): string {
  const prNumber = resource.triggerInfo?.["pr.number"] ?? "?";
  const prTitle = resource.triggerInfo?.["pr.title"] ?? "(unknown)";
  const prUrl = resource.url.replace(/_build\/results.*/, `_git/${resource.repository.name}/pullrequest/${prNumber}`);

  const lines: string[] = [];
  lines.push(`**[FAILED] PR Validation Pipeline Failed**`);
  lines.push("");
  lines.push(`- **Repository:** ${resource.repository.name}`);
  lines.push(`- **Pull Request:** [#${prNumber} ${prTitle}](${prUrl})`);
  lines.push(`- **Pipeline:** ${resource.definition.name}`);
  lines.push(`- **Build:** ${resource.buildNumber}`);

  if (detail?.failedJobName) {
    const stepSuffix = detail.failedStepName ? ` › ${detail.failedStepName}` : "";
    lines.push(`- **Failed Stage/Job:** ${detail.failedJobName}${stepSuffix}`);
  }
  if (detail?.logUrl) {
    lines.push(`- **Logs:** [View logs ↗](${detail.logUrl})`);
  }

  lines.push(`- **Run:** [View pipeline run ↗](${resource.url})`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// PR Completed
// ---------------------------------------------------------------------------

/**
 * Render a channel notification for a successfully merged pull request.
 */
export function renderPRCompleted(resource: PullRequestResource): string {
  const approvers = (resource.reviewers ?? [])
    .filter((r) => r.vote === 10) // 10 = approved in ADO API
    .map((r) => r.displayName)
    .join(", ");

  const closedAt = resource.closedDate
    ? new Date(resource.closedDate).toUTCString().replace(" GMT", " UTC")
    : null;

  const lines: string[] = [];
  lines.push(`**[MERGED] Pull Request Merged** 🎉`);
  lines.push("");
  lines.push(`- **Repository:** ${resource.repository.name}`);
  lines.push(`- **Pull Request:** [#${resource.pullRequestId} ${resource.title}](${resource.url})`);
  lines.push(`- **Author:** ${resource.createdBy.displayName}`);
  if (approvers) lines.push(`- **Approved by:** ${approvers}`);
  if (closedAt) lines.push(`- **Merged at:** ${closedAt}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// PR Comment Digest
// ---------------------------------------------------------------------------

/**
 * Render a digest DM for a batch of comments left on a pull request.
 *
 * Comments from the same author are NOT collapsed — each comment is shown as a
 * separate quoted block attributed to its author so the PR author knows who
 * said what and can reply individually.
 */
export function renderCommentDigest(
  prId: string,
  prTitle: string,
  prUrl: string,
  repoName: string,
  comments: CommentEntry[]
): string {
  const count = comments.length;
  const noun = count === 1 ? "comment" : "comments";

  const lines: string[] = [];
  lines.push(`**💬 New ${noun} on your PR**`);
  lines.push("");
  lines.push(`**[#${prId} ${prTitle}](${prUrl})** — ${repoName}`);
  lines.push("");

  for (const c of comments) {
    lines.push(`**${c.authorDisplayName}:**`);
    // Indent every line of the comment content as a Markdown blockquote.
    const quoted = c.content
      .trim()
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    lines.push(quoted);
    lines.push("");
  }

  lines.push(`*(${count} ${noun})*`);

  return lines.join("\n").trimEnd();
}
