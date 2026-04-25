import type { CaptureState } from "@/types";

interface Props {
  capture: CaptureState;
  setCapture: React.Dispatch<React.SetStateAction<CaptureState>>;
}

export function CaptureControls({ capture, setCapture }: Props) {
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

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/context-collector.js"],
    });

    chrome.tabs.sendMessage(tab.id, { type: "COLLECT_CONTEXT" }, (response) => {
      if (response?.data) {
        setCapture((prev) => ({
          ...prev,
          consoleEntries: response.data.console || [],
          networkErrors: response.data.errors || [],
          pageMetadata: response.data.metadata || prev.pageMetadata,
        }));
      }
    });
  }

  async function handleStartRecording() {
    const response: { success?: boolean; error?: string } =
      await chrome.runtime.sendMessage({ type: "START_RECORDING" });
    if (response.success) {
      setCapture(
        (prev) =>
          ({ ...prev, _recordingState: "recording" }) as CaptureState & {
            _recordingState?: string;
          },
      );
    }
  }

  async function handleStopRecording() {
    const response: { success?: boolean; error?: string } =
      await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
    if (response.success) {
      const result = await chrome.storage.local.get("viberglass_recording");
      if (result.viberglass_recording) {
        const res = await fetch(result.viberglass_recording);
        const blob = await res.blob();
        setCapture(
          (prev) =>
            ({
              ...prev,
              recordingBlob: blob,
              _recordingState: "stopped",
            }) as CaptureState & { _recordingState?: string },
        );
        chrome.storage.local.remove("viberglass_recording");
      }
    }
  }

  const isRecording =
    (capture as CaptureState & { _recordingState?: string })._recordingState ===
    "recording";

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
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
            isRecording
              ? "text-red-700 bg-red-50 border border-red-300 hover:bg-red-100"
              : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
          }`}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          <span className="mr-1">{isRecording ? "⏹" : "⏺"}</span>{" "}
          {isRecording ? "Stop" : "Record"}
        </button>

        <button
          type="button"
          onClick={handleCollectContext}
          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          title="Collect console errors and network info"
        >
          <span className="mr-1">⚙</span> Context
        </button>

        {capture.screenshotDataUrl && (
          <button
            type="button"
            onClick={handleAnnotate}
            className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded hover:bg-amber-100 transition-colors"
            title="Annotate screenshot"
          >
            <span className="mr-1">✎</span> Annotate
          </button>
        )}
      </div>

      {(capture.consoleEntries.length > 0 ||
        capture.networkErrors.length > 0) && (
        <p className="text-xs text-gray-500 mt-1.5">
          Captured {capture.consoleEntries.length} console entries,{" "}
          {capture.networkErrors.length} network errors
        </p>
      )}
    </div>
  );
}
