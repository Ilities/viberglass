import { useState, useEffect } from "react";
import type { AuthState, CaptureState } from "@/types";
import { getAuth, clearAuth } from "@/storage";
import { LoginForm } from "./components/LoginForm";
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

  useEffect(() => {
    getAuth().then((stored) => {
      setAuth(stored);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const listener = (message: {
      type: string;
      data?: unknown;
    }) => {
      if (message.type === "AREA_SELECTED" || message.type === "ELEMENT_SELECTED") {
        const region = message.data as {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        chrome.runtime.sendMessage(
          { type: "CAPTURE_VISIBLE_TAB" },
          (response: { dataUrl?: string; error?: string }) => {
            if (response?.dataUrl) {
              chrome.runtime.sendMessage(
                {
                  type: "CROP_IMAGE",
                  data: {
                    dataUrl: response.dataUrl,
                    ...region,
                  },
                },
                (cropResponse: { dataUrl?: string; error?: string }) => {
                  if (cropResponse?.dataUrl) {
                    setCapture((prev) => ({
                      ...prev,
                      screenshotDataUrl: cropResponse.dataUrl ?? null,
                    }));
                  }
                },
              );
            }
          },
        );
      }

      if (message.type === "ANNOTATION_COMPLETE") {
        const data = message.data as { dataUrl: string };
            setCapture((prev) => ({
              ...prev,
              screenshotDataUrl: null,
              recordingBlob: null,
              annotations: [],
            }));
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
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
      <LoginForm
        onLogin={(a) => setAuth(a)}
      />
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
    />
  );
}
