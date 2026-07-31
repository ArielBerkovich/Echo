const JENKINS_STATUS = {
  success: "success",
  passed: "success",
  failure: "failed",
  failed: "failed",
  unstable: "warning",
  aborted: "cancelled",
  canceled: "cancelled",
  not_built: "skipped",
  not_executed: "skipped",
  skipped: "skipped",
  in_progress: "running",
  running: "running",
  paused_pending_input: "running",
  queued: "running",
};

const STAGE_ICONS = {
  success: "✅",
  failed: "❌",
  warning: "⚠️",
  cancelled: "⛔",
  skipped: "⏭️",
  running: "🔄",
};

function cleanText(value, max = 200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : "";
}

function escapeMarkdown(value, max = 200) {
  return cleanText(value, max).replace(/([\\`*_{}[\]()#+.!|>~-])/g, "\\$1");
}

function positiveMillis(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const normalized = url.toString();
    return (url.protocol === "http:" || url.protocol === "https:") && normalized.length <= 500
      ? normalized
      : "";
  } catch {
    return "";
  }
}

function cleanMention(value) {
  const handle = cleanText(value, 80).replace(/^@/, "");
  return /^[\w.-]+$/.test(handle) ? handle : "";
}

export function normalizeJenkinsStatus(value) {
  const status = cleanText(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  return JENKINS_STATUS[status] || (status ? "warning" : "running");
}

export function formatJenkinsDuration(value) {
  const millis = positiveMillis(value);
  if (millis === null) return "unknown";
  if (millis < 1000) return `${Math.round(millis)}ms`;

  const totalSeconds = millis / 1000;
  if (totalSeconds < 60) {
    const digits = totalSeconds < 10 && !Number.isInteger(totalSeconds) ? 1 : 0;
    return `${totalSeconds.toFixed(digits)}s`;
  }

  const wholeSeconds = Math.round(totalSeconds);
  const seconds = wholeSeconds % 60;
  const totalMinutes = Math.floor(wholeSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${seconds}s`;

  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

function buildStageLines(stages) {
  const lines = [];
  const failedStageNames = new Set();
  let omitted = 0;
  let failedNodeCount = 0;
  let renderedLength = 0;
  let renderedNodeCount = 0;

  function appendLine(line) {
    if (renderedLength + line.length > 2800) {
      omitted += 1;
      return false;
    }
    lines.push(line);
    renderedLength += line.length + 1;
    return true;
  }

  for (const rawStage of stages.slice(0, 200)) {
    const plainName = cleanText(rawStage?.name || rawStage?.displayName || `Stage ${lines.length + 1}`, 160);
    const name = escapeMarkdown(plainName, 160);
    const rawStatus = rawStage?.status || rawStage?.result || rawStage?.state;
    const status = normalizeJenkinsStatus(rawStatus);
    const duration = formatJenkinsDuration(
      rawStage?.durationMillis ?? rawStage?.durationInMillis ?? rawStage?.duration
    );
    const pause = positiveMillis(rawStage?.pauseDurationMillis);
    const pauseLabel = pause ? `, paused ${formatJenkinsDuration(pause)}` : "";
    const statusLabel = status === "success" ? "" : ` — **${escapeMarkdown(rawStatus || status, 40)}**`;
    const line = `- ${STAGE_ICONS[status] || "•"} **${name}** — ${duration}${pauseLabel}${statusLabel}`;

    appendLine(line);
    if (status === "failed") failedStageNames.add(plainName);

    const flowNodes = Array.isArray(rawStage?.stageFlowNodes) ? rawStage.stageFlowNodes : [];
    for (const rawNode of flowNodes) {
      if (renderedNodeCount >= 500) {
        omitted += 1;
        continue;
      }
      renderedNodeCount += 1;
      const nodeName = escapeMarkdown(rawNode?.name || rawNode?.displayName || `Node ${renderedNodeCount}`, 140);
      const nodeRawStatus = rawNode?.status || rawNode?.result || rawNode?.state;
      const nodeStatus = normalizeJenkinsStatus(nodeRawStatus);
      const nodeDuration = formatJenkinsDuration(
        rawNode?.durationMillis ?? rawNode?.durationInMillis ?? rawNode?.duration
      );
      const nodeStatusLabel = nodeStatus === "success"
        ? ""
        : ` — **${escapeMarkdown(nodeRawStatus || nodeStatus, 40)}**`;
      const nodeError = escapeMarkdown(rawNode?.error?.message || rawNode?.errorMessage, 220);
      const errorLabel = nodeError ? ` — ${nodeError}` : "";
      appendLine(
        `  - ${STAGE_ICONS[nodeStatus] || "•"} ${nodeName} — ${nodeDuration}${nodeStatusLabel}${errorLabel}`
      );
      if (nodeStatus === "failed") {
        failedNodeCount += 1;
        failedStageNames.add(plainName);
      }
    }
  }

  omitted += Math.max(0, stages.length - 200);
  if (omitted) lines.push(`- …and ${omitted} more pipeline entr${omitted === 1 ? "y" : "ies"}`);
  return { lines, failedStages: [...failedStageNames], failedNodeCount };
}

function normalizeJenkinsEntry(entry, fallbackName) {
  return {
    id: cleanText(entry?.id, 64),
    name: cleanText(entry?.name || entry?.displayName || fallbackName, 160),
    status: normalizeJenkinsStatus(entry?.status || entry?.result || entry?.state),
    durationMillis: positiveMillis(
      entry?.durationMillis ?? entry?.durationInMillis ?? entry?.duration
    ),
    pauseDurationMillis: positiveMillis(entry?.pauseDurationMillis),
    errorMessage: cleanText(entry?.error?.message || entry?.errorMessage, 400),
  };
}

function normalizeJenkinsStages(stages) {
  return stages.slice(0, 200).map((stage, stageIndex) => ({
    ...normalizeJenkinsEntry(stage, `Stage ${stageIndex + 1}`),
    parallelGroup: cleanText(stage?.parallelGroup || stage?.parallel?.name, 80),
    nodes: (Array.isArray(stage?.stageFlowNodes) ? stage.stageFlowNodes : [])
      .slice(0, 500)
      .map((node, nodeIndex) => normalizeJenkinsEntry(node, `Node ${nodeIndex + 1}`)),
  }));
}

export function buildJenkinsAutomationPayload(input = {}) {
  const pipeline = input.pipeline || input.describe || input.build || input;
  const stages = Array.isArray(pipeline?.stages)
    ? pipeline.stages
    : Array.isArray(input.stages)
      ? input.stages
      : [];
  const jobName = cleanText(input.jobName || input.job?.name || pipeline?.jobName || "Jenkins pipeline", 180);
  const rawBuildNumber = cleanText(input.buildNumber || pipeline?.id || pipeline?.name, 40);
  const buildLabel = rawBuildNumber
    ? rawBuildNumber.startsWith("#") ? rawBuildNumber : `#${rawBuildNumber}`
    : "";
  // A Jenkins Declarative `post` block runs before wfapi marks the run complete.
  // Let the caller's currentBuild.currentResult override the graph status.
  const rawStatus = input.status || input.result || pipeline?.status || "IN_PROGRESS";
  const status = normalizeJenkinsStatus(rawStatus);
  const durationMillis = positiveMillis(
    input.durationMillis ?? pipeline?.durationMillis ?? pipeline?.durationInMillis
  );
  const queueMillis = positiveMillis(input.queueDurationMillis ?? pipeline?.queueDurationMillis);
  const buildUrl = safeHttpUrl(input.buildUrl || input.url || input.job?.buildUrl);
  const { failedStages, failedNodeCount } = buildStageLines(stages);

  const branch = cleanText(input.branch || input.branchName, 200);
  const commit = cleanText(input.commit || input.gitCommit, 80);
  const triggeredBy = cleanText(input.triggeredBy || input.cause, 200);
  const relevantPerson = cleanMention(
    input.relevantPerson || input.notify || input.owner || input.mention
  );
  const fields = [];
  if (branch) fields.push({ name: "Branch", value: branch });
  fields.push({
    name: "Failed stage",
    value: failedStages.length ? failedStages.join(", ").slice(0, 400) : "None",
  });
  if (relevantPerson) fields.push({ name: "Relevant person", value: `@${relevantPerson}` });

  const bodyParts = [];
  if (buildUrl) bodyParts.push(`[Open build in Jenkins](${buildUrl})`);
  if (!bodyParts.length) bodyParts.push("_Jenkins build notification_");

  // Message.body is capped at 4,000 characters. Reserve room for the title and
  // structured fields that postAutomationMessage appends around this body.
  const reserved = 350 + fields.reduce(
    (total, field) => total + field.name.length + field.value.length + 12,
    0
  );
  const bodyLimit = Math.max(500, 3900 - reserved);
  const fullBody = bodyParts.join("\n\n");
  const body = fullBody.length <= bodyLimit
    ? fullBody
    : `${fullBody.slice(0, Math.max(0, bodyLimit - 24)).trimEnd()}\n\n_…report truncated_`;

  const externalKey = cleanText(
    input.externalKey || `jenkins:${jobName}:${rawBuildNumber || cleanText(pipeline?.startTimeMillis, 40)}`,
    256
  );

  return {
    status,
    title: `${jobName}${buildLabel ? ` ${buildLabel}` : ""}`,
    body,
    fields,
    externalKey,
    jenkins: {
      jobName,
      buildNumber: rawBuildNumber.replace(/^#/, ""),
      buildUrl,
      status,
      durationMillis,
      queueDurationMillis: queueMillis,
      branch,
      commit,
      triggeredBy,
      relevantPerson,
      stages: normalizeJenkinsStages(stages),
    },
    report: {
      stageCount: stages.length,
      nodeCount: stages.reduce(
        (total, stage) => total + (Array.isArray(stage?.stageFlowNodes) ? stage.stageFlowNodes.length : 0),
        0
      ),
      failedNodeCount,
      failedStages,
      status,
    },
  };
}
