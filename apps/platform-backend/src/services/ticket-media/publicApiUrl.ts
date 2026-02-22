function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicApiBaseUrl(): string {
  const configured =
    process.env.PLATFORM_API_URL ||
    `http://localhost:${process.env.PORT || "8888"}`;

  return trimTrailingSlashes(configured);
}

export function buildMediaContentUrl(mediaId: string): string {
  return `${getPublicApiBaseUrl()}/api/tickets/media/${encodeURIComponent(mediaId)}/content`;
}
