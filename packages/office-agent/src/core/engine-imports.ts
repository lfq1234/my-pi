/**
 * Phase 0 import-proof reference.
 *
 * These are the six shared pi engine imports the office-agent package is expected
 * to consume once the monorepo packages are built:
 *
 * import { Agent, SessionManager } from "@earendil-works/pi-agent-core";
 * import { setDefaultStreamFn, streamSimple } from "@earendil-works/pi-ai/compat";
 * import { PiClient } from "@earendil-works/pi-client";
 * import type { Command, SessionSnapshot, TranscriptItem } from "@earendil-works/pi-protocol";
 * import type { TelemetryContext, TelemetrySpan } from "@earendil-works/pi-telemetry";
 * import { Box, Markdown, TuiMainScreen } from "@earendil-works/pi-tui";
 */

export const officeAgentEngineImports = {
	agent: "Agent",
	stream: "streamSimple",
	client: "PiClient",
	protocol: "SessionSnapshot",
	telemetry: "TelemetryContext",
	tui: "TuiMainScreen",
};
