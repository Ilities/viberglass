import type { AuthState } from "@/types";

const KEYS = {
  AUTH: "viberglass_auth",
  PLATFORM_URL: "viberglass_platform_url",
  APP_URL: "viberglass_app_url",
  SCREENSHOT: "viberglass_screenshot",
  RECORDING: "viberglass_recording",
  FORM_STATE: "viberglass_form_state",
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

export async function getAppUrl(): Promise<string> {
  const result = await getStorage().get(KEYS.APP_URL);
  return result[KEYS.APP_URL] || "http://localhost:3000";
}

export async function setAppUrl(url: string): Promise<void> {
  await getStorage().set({ [KEYS.APP_URL]: url });
}

export async function getScreenshot(): Promise<string | null> {
  const result = await getStorage().get(KEYS.SCREENSHOT);
  return result[KEYS.SCREENSHOT] ?? null;
}

export async function setScreenshot(dataUrl: string): Promise<void> {
  await getStorage().set({ [KEYS.SCREENSHOT]: dataUrl });
}

export async function clearScreenshot(): Promise<void> {
  await getStorage().remove(KEYS.SCREENSHOT);
}

export async function getRecordingDataUrl(): Promise<string | null> {
  const result = await getStorage().get(KEYS.RECORDING);
  return result[KEYS.RECORDING] ?? null;
}

export async function clearRecording(): Promise<void> {
  await getStorage().remove(KEYS.RECORDING);
}

export async function clearAllCapture(): Promise<void> {
  await getStorage().remove([KEYS.SCREENSHOT, KEYS.RECORDING]);
}

export interface FormState {
  projectId: string;
  agentId: string;
  title: string;
  description: string;
  severity: string;
  writePlan: boolean;
}

export async function getFormState(): Promise<FormState | null> {
  const result = await getStorage().get(KEYS.FORM_STATE);
  return result[KEYS.FORM_STATE] ?? null;
}

export async function setFormState(state: FormState): Promise<void> {
  await getStorage().set({ [KEYS.FORM_STATE]: state });
}

export async function clearAllState(): Promise<void> {
  await getStorage().clear();
}
