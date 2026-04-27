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

      setAuth(storedAuth);
      if (storedScreenshot || recordingBlob) {
        setCapture((prev) => ({
          ...prev,
          screenshotDataUrl: storedScreenshot,
          recordingBlob,
        }));
      }
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
        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="flex items-center justify-center h-[200px] p-5">
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">V</span>
            </div>
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
            className="w-full py-2 px-4 text-sm font-medium text-white bg-amber-500 rounded-md hover:bg-amber-600 transition-colors"
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
