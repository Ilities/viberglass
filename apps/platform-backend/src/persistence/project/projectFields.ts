export const slugify = (text: string) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-"); // Replace multiple - with single -

export const normalizeAgentInstructions = (instructions?: string | null) => {
  if (instructions === undefined) return undefined;
  if (instructions === null) return null;
  const trimmed = instructions.trim();
  return trimmed.length > 0 ? instructions : null;
};
