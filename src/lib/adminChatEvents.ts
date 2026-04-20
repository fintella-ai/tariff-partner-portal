// src/lib/adminChatEvents.ts — retained for backwards-compat; prefer portalChatEvents.
// Team Chat code imports publishAdminChatEvent / AdminChatEvent from this module;
// this file re-exports the generalized bus under those names.
export { publishPortalChatEvent as publishAdminChatEvent } from "./portalChatEvents";
export type { PortalChatEvent as AdminChatEvent } from "./portalChatEvents";
