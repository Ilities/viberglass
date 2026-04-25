import type { AuthState } from "@/types";

const KEYS = {
  AUTH: "viberglass_auth",
  PLATFORM_URL: "viberglass_platform_url",
  DEFAULT_PROJECT: "viberglass_default_project",
  DEFAULT_CLANKER: "viberglass_default_clanker",
  DEFAULT_PHASE: "viberglass_default_phase",
} as const;

function getStorage(): chrome.storage.LocalStorageArea {
  return chrome.storage.local;
}

export async function getAuth(): Promise<AuthState | null> {
  const result = await getStorage().get(KEYS.AUTH);
  return result[KEYS.AUTH] ?? null;
}

export async function setAuth(auth: AuthState): Promise<void> {
  await getStorage().set({ [KEYS.AUTH]: auth });
}

export async function clearAuth(): Promise<void> {
  await getStorage().remove(KEYS.AUTH);
}

export async function getPlatformUrl(): Promise<string> {
  const result = await getStorage().get(KEYS.PLATFORM_URL);
  return result[KEYS.PLATFORM_URL] || "http://localhost:8888";
}

export async function setPlatformUrl(url: string): Promise<void> {
  await getStorage().set({ [KEYS.PLATFORM_URL]: url });
}

export async function getDefaultProject(): Promise<string | null> {
  const result = await getStorage().get(KEYS.DEFAULT_PROJECT);
  return result[KEYS.DEFAULT_PROJECT] ?? null;
}

export async function setDefaultProject(projectId: string): Promise<void> {
  await getStorage().set({ [KEYS.DEFAULT_PROJECT]: projectId });
}

export async function getDefaultClanker(): Promise<string | null> {
  const result = await getStorage().get(KEYS.DEFAULT_CLANKER);
  return result[KEYS.DEFAULT_CLANKER] ?? null;
}

export async function setDefaultClanker(clankerId: string): Promise<void> {
  await getStorage().set({ [KEYS.DEFAULT_CLANKER]: clankerId });
}

export async function getDefaultPhase(): Promise<string | null> {
  const result = await getStorage().get(KEYS.DEFAULT_PHASE);
  return result[KEYS.DEFAULT_PHASE] ?? null;
}

export async function setDefaultPhase(phase: string): Promise<void> {
  await getStorage().set({ [KEYS.DEFAULT_PHASE]: phase });
}
