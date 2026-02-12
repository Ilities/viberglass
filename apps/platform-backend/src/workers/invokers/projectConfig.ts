import type { Project } from "@viberglass/types";

export interface WorkerProjectConfig {
  id: string;
  name: string;
  autoFixTags: string[];
  customFieldMappings: Record<string, string>;
  workerSettings?: Project["workerSettings"];
}

export function buildWorkerProjectConfig(
  project?: Project,
): WorkerProjectConfig | undefined {
  if (!project) {
    return undefined;
  }

  return {
    id: project.id,
    name: project.name,
    autoFixTags: project.autoFixTags,
    customFieldMappings: project.customFieldMappings,
    workerSettings: project.workerSettings,
  };
}
