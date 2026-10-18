import type { PrivacySource } from "@amax/core/privacy";
import { apiRetention } from "@amax/api/module";
import { agentsRetention } from "@amax/agents/module";
import { chatPlatform } from "@amax/chat";
import { workflowsRetention } from "@amax/workflows/server";
import { backupRetention } from "@amax/core/backup";

/** The platform's own retention, beside the installed modules'. One list for the app, the demo seed and
 * the tests, so no platform table is left out of the purge, legal holds and the screen (review 058 B4). */
export const PLATFORM_PRIVACY_SOURCES: PrivacySource[] = [chatPlatform, { id: "workflows", retention: workflowsRetention }, { id: "api", retention: apiRetention }, { id: "suggestions", retention: agentsRetention }, { id: "backup", retention: backupRetention }];

export const privacySources = (modules: PrivacySource[]): PrivacySource[] => [...modules, ...PLATFORM_PRIVACY_SOURCES];
