import path from "path";
import { unzipSync, zipSync } from "fflate";
import { SKILL_ENTRY_FILE, SKILL_NAME_MAX_LENGTH, SKILL_NAME_PATTERN } from "@viberglass/types";
import { AGENT_TOOL_ERROR_CODE, AgentToolServiceError } from "../errors/AgentToolServiceError";
import { readFrontmatter } from "./skillFrontmatter";

const MAX_FILES = 200;
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 1024;
/** Files zip tools add that aren't part of a skill. */
const IGNORED_PATH = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;

/** A skill read from an upload: its SKILL.md fields, and its files zipped with SKILL.md at the root. */
export interface SkillPackage {
  name: string;
  description: string;
  archive: Uint8Array;
  fileCount: number;
  sizeBytes: number;
}

function invalid(message: string): AgentToolServiceError {
  return new AgentToolServiceError(AGENT_TOOL_ERROR_CODE.INVALID, message);
}

function isSafeRelativePath(filePath: string): boolean {
  const normalized = path.posix.normalize(filePath);
  return normalized === filePath && !filePath.startsWith("/") && !filePath.startsWith("../") && filePath !== "..";
}

/** Zip entries without folders and tool clutter; one shared top folder is dropped so SKILL.md sits at the root. */
function filesOfZip(bytes: Uint8Array): Map<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  let declaredBytes = 0;
  let tooLarge = false;
  try {
    // Sizes are checked from the zip's headers before anything is inflated.
    entries = unzipSync(bytes, {
      filter: (file) => {
        declaredBytes += file.originalSize;
        tooLarge ||= declaredBytes > MAX_UNPACKED_BYTES;
        return !tooLarge;
      },
    });
  } catch {
    throw invalid("The file isn't a readable zip archive.");
  }
  if (tooLarge) throw invalid("The skill is larger than 20 MB unpacked.");

  const files = Object.entries(entries).filter(([name]) => !name.endsWith("/") && !IGNORED_PATH.test(name));
  if (files.length === 0) throw invalid("The zip archive is empty.");
  if (files.length > MAX_FILES) throw invalid(`A skill can have at most ${MAX_FILES} files.`);

  const topFolders = new Set(files.map(([name]) => (name.includes("/") ? name.split("/")[0] : "")));
  const [onlyFolder] = topFolders;
  const strip = topFolders.size === 1 && onlyFolder ? `${onlyFolder}/` : "";

  const result = new Map<string, Uint8Array>();
  for (const [name, content] of files) {
    const relative = name.slice(strip.length);
    if (!isSafeRelativePath(relative)) throw invalid(`The archive has an unsafe path: ${name}`);
    result.set(relative, content);
  }
  return result;
}

/**
 * Reads an uploaded skill, either a single SKILL.md or a zip of the skill's
 * folder, and checks it the way harnesses will: a SKILL.md at the root whose
 * frontmatter names the skill and says when to use it.
 */
export function readSkillPackage(fileName: string, bytes: Uint8Array): SkillPackage {
  const files = fileName.toLowerCase().endsWith(".zip")
    ? filesOfZip(bytes)
    : new Map([[SKILL_ENTRY_FILE, bytes]]);

  const sizeBytes = Array.from(files.values()).reduce((total, content) => total + content.length, 0);
  if (sizeBytes > MAX_UNPACKED_BYTES) throw invalid("The skill is larger than 20 MB unpacked.");

  const entry = files.get(SKILL_ENTRY_FILE);
  if (!entry) throw invalid(`The skill needs a ${SKILL_ENTRY_FILE} at the top of the archive.`);

  const frontmatter = readFrontmatter(Buffer.from(entry).toString("utf-8"));
  if (!frontmatter) throw invalid(`${SKILL_ENTRY_FILE} must start with YAML frontmatter between --- lines.`);

  const name = frontmatter.name?.trim() ?? "";
  const description = frontmatter.description?.trim() ?? "";
  if (!name || name.length > SKILL_NAME_MAX_LENGTH || !SKILL_NAME_PATTERN.test(name)) {
    throw invalid("The skill's name must be 1–64 lowercase letters, digits and single hyphens, like pdf-forms.");
  }
  if (!description) throw invalid("The skill's frontmatter needs a description saying what it does and when to use it.");
  if (description.length > MAX_DESCRIPTION_LENGTH) throw invalid("The skill's description must be at most 1,024 characters.");

  return {
    name,
    description,
    archive: zipSync(Object.fromEntries(files)),
    fileCount: files.size,
    sizeBytes,
  };
}

/** The files of a stored skill archive. */
export function unpackSkillArchive(archive: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(archive)).filter(([name]) => !name.endsWith("/")));
}
