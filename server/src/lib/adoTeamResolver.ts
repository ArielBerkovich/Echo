import { Channel } from "../models/Channel.js";
import { AzureDevOpsConfig } from "../models/AzureDevOpsConfig.js";

/**
 * Normalise an Azure DevOps team name to a lowercase hyphenated string that
 * matches Echo's channel naming convention.
 *
 * Example: "Platform Team" → "platform-team"
 */
function normTeamName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Resolve the Echo channel that should receive PR-completed notifications for a
 * given PR author's team.
 *
 * Resolution order:
 *  1. Exact match on AzureDevOpsConfig.teamChannelMapping (adoTeamName, case-insensitive)
 *  2. Convention-based fallback: derive Echo channel name from ADO team name via
 *     normTeamName() and look up Channel.findOne({ name })
 *  3. Fall back to AzureDevOpsConfig.prCompletedChannelId if both mappings fail
 *
 * Returns null if no channel can be determined so the caller can log a warning
 * and skip the notification cleanly.
 */
export async function resolveTeamChannel(
  adoTeamName: string | undefined
): Promise<InstanceType<typeof Channel> | null> {
  const config = await AzureDevOpsConfig.findOne().lean();
  if (!config) return null;

  // 1. Explicit mapping
  if (adoTeamName) {
    const normName = normTeamName(adoTeamName);
    const entry = (config.teamChannelMapping ?? []).find(
      (m: { adoTeamName: string; echoChannelId: unknown }) =>
        normTeamName(m.adoTeamName) === normName
    );
    if (entry) {
      const ch = await Channel.findById(entry.echoChannelId);
      if (ch && !ch.isArchived) return ch;
    }

    // 2. Convention-based: "Platform Team" → channel name "platform-team" or "team-platform"
    const byName =
      (await Channel.findOne({ name: normName, isArchived: false })) ||
      (await Channel.findOne({ name: `team-${normName}`, isArchived: false }));
    if (byName) return byName;
  }

  // 3. Fallback: prCompletedChannelId
  if (config.prCompletedChannelId) {
    const ch = await Channel.findById(config.prCompletedChannelId);
    if (ch && !ch.isArchived) return ch;
  }

  return null;
}
