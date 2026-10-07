// Jest stub for @/lib — the real module reads import.meta.env, which is
// Vite-only and cannot be parsed by ts-jest's CommonJS-oriented pipeline.
export const API_BASE_URL = 'http://localhost:8888'
export const SOURCE_URL = 'https://github.com/Ilities/viberglass'
