// The Flow pages of the Coucou window: none in this fork (dictation, the
// Notetaker and "OK Coucou" were removed); shell.ts draws the Notch ones from
// the island's settings.

import type { FlowPageRenderer, PageId } from "./shell";
import { mailBannedPage, mailOverviewPage, mailRulesPage, mailVIPPage } from "./pages/mail";

export const FLOW_PAGE_RENDERERS: Partial<Record<PageId, FlowPageRenderer>> = {
  mailOverview: mailOverviewPage,
  mailRules: mailRulesPage,
  mailBanned: mailBannedPage,
  mailVIP: mailVIPPage,
};
