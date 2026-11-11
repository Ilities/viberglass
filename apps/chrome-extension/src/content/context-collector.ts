import type { PageMetadata } from "@/types";

interface ContextData {
  metadata: PageMetadata;
}

function collectContext(): ContextData {
  const ua = navigator.userAgent;
  const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge)\/([\d.]+)/);
  const osMatch = ua.match(/\(([^)]+)\)/);

  const metadata: PageMetadata = {
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
    browserName: browserMatch?.[1] || "Unknown",
    browserVersion: browserMatch?.[2] || "Unknown",
    osName: osMatch?.[1]?.split(";")[0]?.trim() || "Unknown",
    osVersion: osMatch?.[1]?.split(";")[1]?.trim() || "Unknown",
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
    userAgent: ua,
    language: navigator.language,
    cookiesEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
  };

  return { metadata };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "COLLECT_CONTEXT") {
    sendResponse({ data: collectContext() });
  }
});
