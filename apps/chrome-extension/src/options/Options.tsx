import { useEffect, useState } from "react";
import { clearAllState, getAppUrl, getPlatformUrl, setAppUrl, setPlatformUrl } from "@/storage";
import { Logo } from "@/components/Logo";

export function Options() {
  const [apiUrl, setApiUrl] = useState("");
  const [appUrl, setAppUrlState] = useState("");
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    Promise.all([getPlatformUrl(), getAppUrl()]).then(([api, app]) => {
      setApiUrl(api);
      setAppUrlState(app);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const normalizedApi = apiUrl.replace(/\/+$/, "");
    const normalizedApp = appUrl.replace(/\/+$/, "");
    await Promise.all([setPlatformUrl(normalizedApi), setAppUrl(normalizedApp)]);
    setApiUrl(normalizedApi);
    setAppUrlState(normalizedApp);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <div className="flex items-center gap-3 mb-8">
        <Logo className="w-10 h-10 rounded-lg" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Viberglass</h1>
          <p className="text-sm text-gray-500">Extension settings</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API URL
          </label>
          <input
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:8888"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-burnt-orange"
          />
          <p className="text-xs text-gray-500 mt-1">
            Backend API server URL
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            App URL
          </label>
          <input
            type="url"
            value={appUrl}
            onChange={(e) => setAppUrlState(e.target.value)}
            placeholder="http://localhost:3000"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-burnt-orange"
          />
          <p className="text-xs text-gray-500 mt-1">
            Frontend app URL (used for ticket links)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-brand-burnt-orange rounded-md hover:bg-brand-golden-brass transition-colors"
          >
            Save
          </button>
          {saved && (
            <span className="text-sm text-green-600">Settings saved</span>
          )}
        </div>
      </form>

      <hr className="my-8 border-gray-200" />

      <div>
        <h2 className="text-sm font-medium text-gray-900 mb-2">Reset</h2>
        <p className="text-xs text-gray-500 mb-3">
          Clear all extension data including auth, settings, and saved form state
        </p>
        <button
          type="button"
          onClick={async () => {
            await clearAllState();
            setCleared(true);
            setApiUrl("http://localhost:8888");
            setAppUrlState("http://localhost:3000");
            setTimeout(() => setCleared(false), 2000);
          }}
          className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
        >
          Reset all state
        </button>
        {cleared && (
          <span className="text-sm text-green-600 ml-3">State cleared</span>
        )}
      </div>
    </div>
  );
}
