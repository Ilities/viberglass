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

  if (message.type === "AREA_SELECTED" || message.type === "ELEMENT_SELECTED") {
    handleSelectionCapture(message.data)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "ANNOTATION_COMPLETE") {
    const dataUrl = (message.data as { dataUrl: string }).dataUrl;
    chrome.storage.local
      .set({ viberglass_screenshot: dataUrl })
      .then(() => sendResponse({ success: true }))
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

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result as string });
    reader.onerror = () => reject(new Error("Failed to read cropped image"));
    reader.readAsDataURL(croppedBlob);
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });
  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL("offscreen.html"),
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Record tab video for bug reports",
    });
  }
}

async function handleStartRecording(): Promise<{ success: boolean }> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) throw new Error("No active tab");

  await ensureOffscreenDocument();

  const streamId: string = await new Promise((resolve) => {
    chrome.tabCapture.getMediaStreamId(
      { targetTabId: tab.id } as chrome.tabCapture.GetMediaStreamOptions,
      (id: string) => resolve(id),
    );
  });

  const response = await chrome.runtime.sendMessage({
    type: "START_RECORDING_OFFSCREEN",
    target: "offscreen",
    streamId,
  }) as { success?: boolean; error?: string };

  if (!response?.success) throw new Error(response?.error ?? "Failed to start recording");
  return { success: true };
}

async function handleStopRecording(): Promise<{ success: boolean }> {
  const response = await chrome.runtime.sendMessage({
    type: "STOP_RECORDING_OFFSCREEN",
    target: "offscreen",
  }) as { dataUrl?: string; error?: string };

  if (response?.dataUrl) {
    await chrome.storage.local.set({ viberglass_recording: response.dataUrl });
    await chrome.offscreen.closeDocument().catch(() => {});
    return { success: true };
  }

  throw new Error(response?.error ?? "Failed to stop recording");
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

async function handleSelectionCapture(region: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  const captureResult = await handleCaptureVisibleTab();
  const cropResult = await handleCropImage(
    captureResult.dataUrl,
    region.x,
    region.y,
    region.width,
    region.height,
  );
  await chrome.storage.local.set({ viberglass_screenshot: cropResult.dataUrl });
}

export {};
