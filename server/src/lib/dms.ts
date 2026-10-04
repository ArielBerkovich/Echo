// Compatibility exports for integrations and tests that still import the
// legacy helper path. Conversation persistence is implemented in the service.
export { dmName, ensureDmChannel, ensureGroupDmChannel, ensureSelfDmChannel } from "../services/conversationService.js";
