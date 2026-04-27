import { apiJson } from "./client";
import type { Project, Clanker } from "@/types";

export async function listProjects(): Promise<Project[]> {
  const result = await apiJson<{
    success: boolean;
    data: Project[];
    pagination: { limit: number; offset: number; count: number };
  }>("/api/projects");
  return result.data;
}

export async function getProject(projectId: string): Promise<Project> {
  const result = await apiJson<{ success: boolean; data: Project }>(
    `/api/projects/${projectId}`,
  );
  return result.data;
}

export async function listClankers(_projectId: string): Promise<Clanker[]> {
  const result = await apiJson<{
    success: boolean;
    data: Clanker[];
  }>("/api/clankers");
  return result.data;
}
