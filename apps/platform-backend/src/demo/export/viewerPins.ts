import type { BundlePin } from "../bundle/bundleManifest";
import { idValue, textValue, type Row } from "../bundle/jsonValues";
import type { ViewerPinSpec } from "./exportConfig";

const describeSpec = (spec: ViewerPinSpec): string => ("app" in spec ? `app ${spec.app}` : `artifact "${spec.artifact}" in ${spec.space}`);

/** Resolves the config's viewer pins against the exported rows, titled as the UI titles a pin. */
export function resolveViewerPins(specs: readonly ViewerPinSpec[], rowsOf: (table: string) => readonly Row[]): BundlePin[] {
  const spaces = rowsOf("projects");
  const spaceBySlug = (slug: string) => spaces.find((space) => textValue(space, "slug") === slug);
  const pins: BundlePin[] = [];
  const unknown: string[] = [];
  for (const spec of specs) {
    const pin = "app" in spec ? appPin(spaceBySlug(spec.app)) : artifactPin(spaceBySlug(spec.space), spec.artifact, rowsOf("artifacts"));
    if (pin) pins.push(pin);
    else unknown.push(describeSpec(spec));
  }
  if (unknown.length > 0) throw new Error(`viewer.pins names what the export doesn't have: ${unknown.join(", ")}`);
  return pins;
}

function appPin(space: Row | undefined): BundlePin | null {
  const spaceId = space ? idValue(space, "id") : null;
  const name = space ? textValue(space, "name") : null;
  if (!space || !spaceId || name === null || textValue(space, "backing_kind") !== "app") return null;
  return { target: { kind: "app", spaceId }, title: name };
}

function artifactPin(space: Row | undefined, title: string, artifacts: readonly Row[]): BundlePin | null {
  const spaceId = space ? idValue(space, "id") : null;
  if (!spaceId) return null;
  const matches = artifacts.filter((artifact) => idValue(artifact, "project_id") === spaceId && textValue(artifact, "title") === title);
  const artifactId = matches.length === 1 ? idValue(matches[0], "id") : null;
  return artifactId ? { target: { kind: "artifact", artifactId }, title } : null;
}
