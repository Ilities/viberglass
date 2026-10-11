export const API_BASE_URL = import.meta.env.VITE_API_URL ?? `http://localhost:${import.meta.env.VITE_BACKEND_PORT ?? 8888}`

/** Where this installation's source code is published, so a modified installation can point to its own. */
export const SOURCE_URL = import.meta.env.VITE_SOURCE_URL || 'https://github.com/Ilities/viberglass'
