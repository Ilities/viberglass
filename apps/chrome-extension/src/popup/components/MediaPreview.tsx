interface Props {
  screenshotDataUrl: string | null;
  recordingBlob: Blob | null;
  onRemoveScreenshot: () => void;
  onRemoveRecording: () => void;
}

export function MediaPreview({
  screenshotDataUrl,
  recordingBlob,
  onRemoveScreenshot,
  onRemoveRecording,
}: Props) {
  if (!screenshotDataUrl && !recordingBlob) return null;

  return (
    <div className="flex gap-2">
      {screenshotDataUrl && (
        <div className="relative flex-1">
          <img
            src={screenshotDataUrl}
            alt="Screenshot"
            className="w-full h-20 object-cover rounded-md border border-gray-200"
          />
          <button
            type="button"
            onClick={onRemoveScreenshot}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
          >
            ×
          </button>
          <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
            Screenshot
          </span>
        </div>
      )}

      {recordingBlob && (
        <div className="relative flex-1">
          <div className="w-full h-20 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center">
            <div className="text-center">
              <span className="text-lg">🎥</span>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {(recordingBlob.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRemoveRecording}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
          >
            ×
          </button>
          <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
            Recording
          </span>
        </div>
      )}
    </div>
  );
}
