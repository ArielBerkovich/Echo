import crypto from "crypto";
import { User } from "../models/User.js";
import { AzureDevOpsConfig } from "../models/AzureDevOpsConfig.js";
import { hashAdoToken, createAdoToken } from "./adoWebhookVerifier.js";

const BOT_USERNAME = "azure-devops-bot";
const BOT_DISPLAY_NAME = "Azure DevOps";

/**
 * Ensure that a system "Azure DevOps" bot user exists in Echo and that
 * AzureDevOpsConfig has a valid tokenHash and botUserId.
 *
 * This function is idempotent and safe to call on every server startup.
 *
 * Workflow:
 *  1. Find or create the bot User document.
 *  2. Find or create the AzureDevOpsConfig singleton.
 *     - If no config exists, create one with a freshly generated token and
 *       print the webhook URL fragment to stdout so an admin can register it
 *       in Azure DevOps.
 *
 * The raw token is printed once and never stored — the admin must save the
 * full webhook URL at this point.
 */
export async function ensureAdoBotUser(): Promise<void> {
  // --- Bot user ---
  let bot = await User.findOne({ username: BOT_USERNAME });
  if (!bot) {
    // The bot has a random, non-memorable password since it never logs in.
    const fakeHash = crypto.randomBytes(32).toString("hex");
    bot = await User.create({
      username: BOT_USERNAME,
      displayName: BOT_DISPLAY_NAME,
      passwordHash: fakeHash,
    });
    console.info(`[ado] Created bot user '${BOT_USERNAME}' (id: ${bot._id})`);
  }

  // --- Config singleton ---
  let config = await AzureDevOpsConfig.findOne();
  if (!config) {
    const rawToken = createAdoToken();
    const tokenHash = hashAdoToken(rawToken);
    config = await AzureDevOpsConfig.create({
      tokenHash,
      botUserId: bot._id,
    });
    console.info(
      `[ado] Azure DevOps config created.\n` +
        `      Register the following webhook URL in your Azure DevOps project:\n` +
        `      POST <your-echo-host>/api/azure-devops/webhook/${rawToken}\n` +
        `      (Token shown only once — save it now)`
    );
  } else if (!config.botUserId || String(config.botUserId) !== String(bot._id)) {
    // Keep botUserId in sync if the config was created before the bot user.
    config.botUserId = bot._id;
    await config.save();
  }
}
