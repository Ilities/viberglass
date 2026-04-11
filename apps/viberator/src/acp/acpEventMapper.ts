// Re-export from agent-core.
import { defaultAcpEventMapper } from "@viberglass/agent-core";

export type { PlatformSessionEvent, AcpEventMapper } from "@viberglass/agent-core";
export { defaultAcpEventMapper };

// Backwards-compatible individual function exports (previously exported as top-level functions).
export const mapSessionUpdate = defaultAcpEventMapper.mapSessionUpdate.bind(defaultAcpEventMapper);
export const mapPermissionRequest = defaultAcpEventMapper.mapPermissionRequest.bind(defaultAcpEventMapper);
export const detectsNeedsInput = defaultAcpEventMapper.detectsNeedsInput.bind(defaultAcpEventMapper);
