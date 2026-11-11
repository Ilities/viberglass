import type { CaptureState } from "@/types";
import { collectPageContext } from "../page-context";

interface Props {
  capture: CaptureState;
  setCapture: React.Dispatch<React.SetStateAction<CaptureState>>;
}

export function CaptureControls({ capture, setCapture }: Props) {
  const consoleCount = capture.consoleEntries.length + capture.uncaughtErrors.length;

  async function handleAreaScreenshot() {
    await chrome.runtime.sendMessage({ type: "INJECT_AREA_SELECTOR" });
    window.close();
  }

  async function handleElementScreenshot() {
    await chrome.runtime.sendMessage({ type: "INJECT_ELEMENT_SELECTOR" });
    window.close();
  }

  async function handleTabScreenshot() {
    const response: { dataUrl?: string; error?: string } =
      await chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" });
    if (response.dataUrl) {
      setCapture((prev) => ({
        ...prev,
        screenshotDataUrl: response.dataUrl!,
      }));
    }
  }

  async function handleAnnotate() {
    if (!capture.screenshotDataUrl) return;
    await chrome.runtime.sendMessage({
      type: "INJECT_ANNOTATOR",
      data: { screenshotDataUrl: capture.screenshotDataUrl },
    });
    window.close();
  }

  async function handleCollectContext() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return;

    const page = await collectPageContext(tab.id);
    setCapture((prev) => ({
      ...prev,
      consoleEntries: page.consoleEntries ?? [],
      uncaughtErrors: page.uncaughtErrors ?? [],
      failedRequests: page.failedRequests ?? [],
      pageMetadata: page.pageMetadata || prev.pageMetadata,
    }));
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        Capture
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={handleAreaScreenshot}
          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          title="Select area to capture"
        >
          <span className="mr-1">⬚</span> Area
        </button>

        <button
          type="button"
          onClick={handleElementScreenshot}
          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          title="Click element to capture"
        >
          <span className="mr-1">⊰</span> Element
        </button>

        <button
          type="button"
          onClick={handleTabScreenshot}
          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          title="Capture visible tab"
        >
          <span className="mr-1">☐</span> Tab
        </button>

        <button
          type="button"
          onClick={handleCollectContext}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            capture.pageMetadata.url
              ? "text-brand-burnt-orange bg-brand-cream border border-brand-golden-brass"
              : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
          }`}
          title="Collect console errors, network errors, and page metadata from this tab"
        >
          <span className="mr-1">⚙</span> Context
        </button>

        {capture.screenshotDataUrl && (
          <button
            type="button"
            onClick={handleAnnotate}
            className="px-2.5 py-1 text-xs font-medium text-brand-burnt-orange bg-brand-cream border border-brand-golden-brass rounded hover:bg-brand-cream/80 transition-colors"
            title="Annotate screenshot"
          >
            <span className="mr-1">✎</span> Annotate
          </button>
        )}
      </div>

      {capture.pageMetadata.url && (
        <p className="text-xs text-gray-500 mt-1.5">
          Context captured from{" "}
          <span className="text-gray-600 font-medium" title={capture.pageMetadata.url}>
            {new URL(capture.pageMetadata.url).host}
          </span>
          {consoleCount > 0 || capture.failedRequests.length > 0
            ? ` — ${consoleCount} console ${consoleCount === 1 ? "error" : "errors"}, ${capture.failedRequests.length} failed ${capture.failedRequests.length === 1 ? "request" : "requests"}`
            : " — no console errors or failed requests found"}
        </p>
      )}
    </div>
  );
}
