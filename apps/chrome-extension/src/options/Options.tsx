import { useEffect, useState } from "react";
import { getPlatformUrl, setPlatformUrl } from "@/storage";

export function Options() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPlatformUrl().then(setUrl);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const normalized = url.replace(/\/+$/, "");
    await setPlatformUrl(normalized);
    setUrl(normalized);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
          <span className="text-white font-bold text-lg">V</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Viberglass</h1>
          <p className="text-sm text-gray-500">Extension settings</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Platform URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8888"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The URL of your Viberglass platform instance
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-md hover:bg-amber-600 transition-colors"
          >
            Save
          </button>
          {saved && (
            <span className="text-sm text-green-600">Settings saved</span>
          )}
        </div>
      </form>
    </div>
  );
}
