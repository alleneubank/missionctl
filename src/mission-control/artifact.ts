import { parse } from "yaml";

import type { CampaignDocument, MissionDocument, ParsedArtifact } from "./types.js";

export class ArtifactParseError extends Error {
  readonly path: string;

  constructor(path: string, message: string, cause?: unknown) {
    super(`${path}: ${message}`, { cause });
    this.name = "ArtifactParseError";
    this.path = path;
  }
}

function parseArtifact<T>(text: string, path: string): ParsedArtifact<T> {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    throw new ArtifactParseError(path, "missing opening YAML frontmatter delimiter");
  }

  const close = normalized.indexOf("\n---\n", 4);
  if (close === -1) {
    throw new ArtifactParseError(path, "missing closing YAML frontmatter delimiter");
  }

  const source = normalized.slice(4, close);
  let document: unknown;
  try {
    document = parse(source);
  } catch (error) {
    throw new ArtifactParseError(path, "invalid YAML frontmatter", error);
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new ArtifactParseError(path, "frontmatter must be a mapping");
  }

  return {
    document: document as T,
    body: normalized.slice(close + 5),
    path,
  };
}

export function parseMissionArtifact(text: string, path: string): ParsedArtifact<MissionDocument> {
  return parseArtifact<MissionDocument>(text, path);
}

export function parseCampaignArtifact(text: string, path: string): ParsedArtifact<CampaignDocument> {
  return parseArtifact<CampaignDocument>(text, path);
}
