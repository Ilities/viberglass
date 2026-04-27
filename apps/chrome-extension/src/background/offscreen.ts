let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "START_RECORDING_OFFSCREEN") {
    startRecording(message.streamId as string)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "STOP_RECORDING_OFFSCREEN") {
    stopRecording()
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ error: err.message }));
    return true;
  }
});

async function startRecording(
  streamId: string,
): Promise<{ success: boolean }> {
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

async function stopRecording(): Promise<{ dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      reject(new Error("No active recording"));
      return;
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      recordedChunks = [];

      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result as string });
      reader.onerror = () => reject(new Error("Failed to read recording"));
      reader.readAsDataURL(blob);

      mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
      mediaRecorder = null;
    };

    mediaRecorder.stop();
  });
}
