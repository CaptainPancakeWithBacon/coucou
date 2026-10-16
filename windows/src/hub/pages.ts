// The Flow pages of the Coucou window: none in this fork (dictation, the
// Notetaker and "OK Coucou" were removed); shell.ts draws the Notch ones from
// the island's settings.

import type { FlowPageRenderer, PageId } from "./shell";

export const FLOW_PAGE_RENDERERS: Partial<Record<PageId, FlowPageRenderer>> = {};
