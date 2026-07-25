import mongoose from "mongoose";

/**
 * Singleton configuration document for the Azure DevOps webhook integration.
 *
 * Only one document should exist in this collection.  It is created via the
 * admin setup script or the admin API and read on every incoming webhook.
 */
const azureDevOpsConfigSchema = new mongoose.Schema(
  {
    /**
     * SHA-256 hex digest of the opaque URL token embedded in the ADO webhook
     * URL (e.g. POST /api/azure-devops/webhook/<token>).  The raw token is
     * only ever stored in Azure DevOps' service hook configuration.
     */
    tokenHash: { type: String, required: true, trim: true },

    /** Base URL of the Azure DevOps organisation, e.g. https://dev.azure.com/my-org */
    organizationUrl: { type: String, default: "", trim: true, maxlength: 256 },

    /** Default ADO project name (informational; used for link enrichment). */
    project: { type: String, default: "", trim: true, maxlength: 128 },

    /**
     * ObjectId of the Echo "Azure DevOps" bot user that authors all
     * notifications.  Seeded at startup by ensureAdoBotUser().
     */
    botUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    /**
     * Optional Echo channel to post PR-completed notifications to.
     * If absent, only team-channel mapping entries are used.
     */
    prCompletedChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
      default: null,
    },

    /**
     * How long (in seconds) to buffer PR comment events before flushing a
     * digest DM to the PR author.  Default: 120 s (2 minutes).
     */
    commentAggregationWindowSeconds: { type: Number, default: 120, min: 10, max: 3600 },

    /**
     * Static identity mapping: Azure DevOps e-mail → Echo User ObjectId.
     * Used by adoUserResolver as the primary resolution strategy.
     */
    userMapping: [
      {
        _id: false,
        adoEmail: { type: String, required: true, trim: true, lowercase: true },
        echoUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      },
    ],

    /**
     * Static team → channel mapping used for PR-completed notifications.
     * Key is the Azure DevOps team name (case-insensitive match at runtime).
     */
    teamChannelMapping: [
      {
        _id: false,
        adoTeamName: { type: String, required: true, trim: true },
        echoChannelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true },
      },
    ],

    /**
     * Optional Azure DevOps Personal Access Token used to call ADO REST APIs
     * for build-timeline enrichment.  Stored as-is (consider encrypting at
     * rest in a production hardening pass).
     */
    adoPat: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

export const AzureDevOpsConfig = mongoose.model("AzureDevOpsConfig", azureDevOpsConfigSchema);
