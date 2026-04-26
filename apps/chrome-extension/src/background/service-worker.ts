chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CAPTURE_VISIBLE_TAB") {
    handleCaptureVisibleTab(message.scale)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "START_RECORDING") {
    handleStartRecording()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "STOP_RECORDING") {
    handleStopRecording()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "INJECT_AREA_SELECTOR") {
    injectContentScript("content/area-selector.js")
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "INJECT_ELEMENT_SELECTOR") {
    injectContentScript("content/element-selector.js")
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "INJECT_ANNOTATOR") {
    injectContentScript("content/annotator.js", message.data)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "INJECT_CONTEXT_COLLECTOR") {
    injectContentScript("content/context-collector.js")
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "API_REQUEST") {
    handleApiRequest(message.data)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message, status: err.status }));
    return true;
  }

  if (message.type === "CROP_IMAGE") {
    handleCropImage(
      message.data.dataUrl,
      message.data.x,
      message.data.y,
      message.data.width,
      message.data.height,
    )
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleApiRequest(data: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(data.url, {
    method: data.method,
    headers: data.headers,
    body: data.body,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return { ok: response.ok, status: response.status, body };
}

async function handleCaptureVisibleTab(
  _scale?: number,
): Promise<{ dataUrl: string }> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) throw new Error("No active tab");

  const dataUrl = await chrome.tabs.captureVisibleTab(
    chrome.windows.WINDOW_ID_CURRENT,
    { format: "png" },
  );

  return { dataUrl };
}

async function handleCropImage(
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<{ dataUrl: string }> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, x, y, width, height);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  const reader = new FileReaderSync();
  const croppedDataUrl = reader.readAsDataURL(croppedBlob);

  return { dataUrl: croppedDataUrl };
}

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

async function handleStartRecording(): Promise<{ success: boolean }> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) throw new Error("No active tab");

  const streamId: string = await new Promise((resolve) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tab.id } as chrome.tabCapture.GetMediaStreamOptions,
      (id: string) => resolve(id),
    );
  });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
  });

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.start(1000);
  return { success: true };
}

async function handleStopRecording(): Promise<{ success: boolean }> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      reject(new Error("No active recording"));
      return;
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      recordedChunks = [];

      const reader = new FileReader();
      reader.onload = () => {
        chrome.storage.local.set({
          viberglass_recording: reader.result,
        });
        resolve({ success: true });
      };
      reader.onerror = () => reject(new Error("Failed to read recording"));
      reader.readAsDataURL(blob);

      mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
      mediaRecorder = null;
    };

    mediaRecorder.stop();
  });
}

async function injectContentScript(
  scriptPath: string,
  data?: unknown,
): Promise<void> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) throw new Error("No active tab");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [scriptPath],
  });

  if (data) {
    chrome.tabs.sendMessage(tab.id, {
      type: "CONTENT_SCRIPT_INIT",
      data,
    });
  }
}

export {};
