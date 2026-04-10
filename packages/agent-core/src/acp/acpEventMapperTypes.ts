import type { PlatformSessionEvent } from "./types";

export interface AcpEventMapper {
  mapSessionUpdate(params: unknown): PlatformSessionEvent[];
  mapPermissionRequest(params: unknown): PlatformSessionEvent;
  detectsNeedsInput(lastAssistantText: string): boolean;
}
