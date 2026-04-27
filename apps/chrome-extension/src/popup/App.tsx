import { useState, useEffect, useRef } from "react";
import type { AuthState, CaptureState } from "@/types";
import {
  getAuth,
  clearAuth,
  getScreenshot,
  setScreenshot,
  clearScreenshot,
  getRecordingDataUrl,
  clearAllCapture,
} from "@/storage";
import { TicketForm } from "./components/TicketForm";
import { Logo } from "@/components/Logo";

const initialCapture: CaptureState = {
  screenshotDataUrl: null,
  recordingBlob: null,
  consoleEntries: [],
  networkErrors: [],
  pageMetadata: {
    url: "",
    title: "",
    referrer: "",
    browserName: "Chrome",
    browserVersion: "",
    osName: "",
    osVersion: "",
    screenWidth: 0,
    screenHeight: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    pixelRatio: 1,
    userAgent: "",
    language: "",
    cookiesEnabled: true,
    onLine: true,
  },
  annotations: [],
};

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [capture, setCapture] = useState<CaptureState>(initialCapture);
  const captureSyncedRef = useRef(false);

  useEffect(() => {
    async function load() {
      const [storedAuth, storedScreenshot, recordingResult] =
        await Promise.all([getAuth(), getScreenshot(), getRecordingDataUrl()]);

      let recordingBlob: Blob | null = null;
      if (recordingResult) {
        const res = await fetch(recordingResult);
        recordingBlob = await res.blob();
      }

      const ua = navigator.userAgent;
      const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge)\/([\d.]+)/);
      const osMatch = ua.match(/\(([^)]+)\)/);

      let tabUrl = "";
      let tabTitle = "";
      let pageMetadata: CaptureState["pageMetadata"] | null = null;

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabUrl = tab?.url || "";
        tabTitle = tab?.title || "";

        if (tab?.id && tab.url && !tab.url.startsWith("chrome")) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["content/context-collector.js"],
            });

            const response = await new Promise<{
              data?: { metadata?: CaptureState["pageMetadata"] };
            }>((resolve) => {
              chrome.tabs.sendMessage(
                tab.id!,
                { type: "COLLECT_CONTEXT" },
                (res) => resolve(res ?? {}),
              );
            });

            if (response?.data?.metadata) {
              pageMetadata = response.data.metadata;
            }
          } catch {}
        }
      } catch {}

      setAuth(storedAuth);
      setCapture((prev) => ({
        ...prev,
        screenshotDataUrl: storedScreenshot,
        recordingBlob,
        pageMetadata: pageMetadata ?? {
          url: tabUrl,
          title: tabTitle,
          referrer: "",
          browserName: browserMatch?.[1] || "Chrome",
          browserVersion: browserMatch?.[2] || "",
          osName: osMatch?.[1]?.split(";")[0]?.trim() || "",
          osVersion: osMatch?.[1]?.split(";")[1]?.trim() || "",
          screenWidth: window.screen.width || 1,
          screenHeight: window.screen.height || 1,
          viewportWidth: window.innerWidth || window.screen.width || 1,
          viewportHeight: window.innerHeight || window.screen.height || 1,
          pixelRatio: window.devicePixelRatio || 1,
          userAgent: ua,
          language: navigator.language,
          cookiesEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine,
        },
      }));
      captureSyncedRef.current = true;
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!captureSyncedRef.current) return;
    if (capture.screenshotDataUrl) {
      setScreenshot(capture.screenshotDataUrl);
    } else {
      clearScreenshot();
    }
  }, [capture.screenshotDataUrl]);

  useEffect(() => {
    function listener(changes: {
      [key: string]: chrome.storage.StorageChange;
    }) {
      if (changes.viberglass_screenshot) {
        const newValue = changes.viberglass_screenshot.newValue ?? null;
        setCapture((prev) => ({ ...prev, screenshotDataUrl: newValue }));
      }
    }
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <div className="w-5 h-5 border-2 border-brand-burnt-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="flex items-center justify-center h-[200px] p-5">
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center mb-4">
            <Logo className="w-8 h-8 rounded-lg" />
            <span className="text-base font-semibold text-gray-900">
              Viberglass
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Sign in to capture bugs</p>
          <button
            onClick={() =>
              chrome.tabs.create({
                url: chrome.runtime.getURL("login.html"),
              })
            }
            className="w-full py-2 px-4 text-sm font-medium text-white bg-brand-burnt-orange rounded-md hover:bg-brand-golden-brass transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <TicketForm
      auth={auth}
      capture={capture}
      setCapture={setCapture}
      onLogout={async () => {
        await clearAuth();
        setAuth(null);
      }}
      onClearCapture={async () => {
        await clearAllCapture();
        setCapture(initialCapture);
      }}
    />
  );
}
