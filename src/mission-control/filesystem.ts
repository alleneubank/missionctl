import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { ArtifactParseError, parseCampaignArtifact, parseMissionArtifact } from "./artifact.js";
import type {
  CampaignDocument,
  MissionDocument,
  ParsedArtifact,
  ValidationIssue,
} from "./types.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".rl",
  ".zig-cache",
  "node_modules",
  "target",
  "zig-out",
]);
const MAX_ARTIFACTS = 1_000;

export interface LocatedArtifact<T> extends ParsedArtifact<T> {
  path: string;
}

export interface LegacyCampaign {
  path: string;
  reason: "untyped";
}

export interface DiscoveryIssue extends ValidationIssue {
  artifact_path: string;
}

export interface DiscoveredArtifacts {
  missions: LocatedArtifact<MissionDocument>[];
  campaigns: LocatedArtifact<CampaignDocument>[];
  legacy: LegacyCampaign[];
  issues: DiscoveryIssue[];
}

function discoveryIssue(artifactPath: string, code: string, message: string): DiscoveryIssue {
  return { artifact_path: artifactPath, code, path: artifactPath, message };
}

function isTypedFrontmatter(text: string): boolean {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return false;
  const normalized = text.replaceAll("\r\n", "\n");
  const close = normalized.indexOf("\n---\n", 4);
  if (close === -1) return true;
  return /^mission_control\s*:/m.test(normalized.slice(4, close));
}

function artifactPaths(root: string): string[] {
  const paths: string[] = [];
  const visit = (path: string): void => {
    const stat = statSync(path);
    if (stat.isFile()) {
      const name = path.slice(path.lastIndexOf("/") + 1);
      if (name === "MISSION.md" || name === "LOOP.md") paths.push(path);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      visit(join(path, entry.name));
      if (paths.length > MAX_ARTIFACTS) {
        throw new Error(`artifact discovery exceeded the ${MAX_ARTIFACTS} file bound under ${root}`);
      }
    }
  };
  visit(root);
  return paths;
}

export function discoverArtifacts(roots: readonly string[]): DiscoveredArtifacts {
  const discovered: DiscoveredArtifacts = { missions: [], campaigns: [], legacy: [], issues: [] };
  const uniquePaths = new Set<string>();
  for (const requested of roots) {
    const root = resolve(requested);
    let paths: string[];
    try {
      paths = artifactPaths(root);
    } catch (error) {
      discovered.issues.push(
        discoveryIssue(root, "discovery.unavailable-root", error instanceof Error ? error.message : String(error)),
      );
      continue;
    }
    for (const path of paths) {
      if (uniquePaths.has(path)) continue;
      uniquePaths.add(path);
      const text = readFileSync(path, "utf8");
      try {
        if (path.endsWith("/MISSION.md")) {
          discovered.missions.push(parseMissionArtifact(text, path));
        } else if (!isTypedFrontmatter(text)) {
          discovered.legacy.push({ path, reason: "untyped" });
        } else {
          discovered.campaigns.push(parseCampaignArtifact(text, path));
        }
      } catch (error) {
        const message = error instanceof ArtifactParseError ? error.message : String(error);
        discovered.issues.push(discoveryIssue(path, "artifact.parse-error", message));
      }
    }
  }
  discovered.missions.sort((left, right) => left.path.localeCompare(right.path));
  discovered.campaigns.sort((left, right) => left.path.localeCompare(right.path));
  discovered.legacy.sort((left, right) => left.path.localeCompare(right.path));
  return discovered;
}

function isWithin(candidate: string, parent: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export function missionForCampaign(
  campaign: LocatedArtifact<CampaignDocument>,
  missions: readonly LocatedArtifact<MissionDocument>[],
): LocatedArtifact<MissionDocument> | undefined {
  const matching = missions.filter((mission) => mission.document.id === campaign.document.mission_id);
  const local = matching
    .filter((mission) => isWithin(dirname(campaign.path), dirname(mission.path)))
    .sort((left, right) => dirname(right.path).length - dirname(left.path).length)[0];
  if (local) return local;
  return matching.length === 1 ? matching[0] : undefined;
}

function findUp(start: string, name: string): string | undefined {
  let current = resolve(start);
  if (statSync(current).isFile()) current = dirname(current);
  while (true) {
    const candidate = join(current, name);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Absence is expected while walking to the filesystem root.
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function loadCurrent(root: string): {
  mission: LocatedArtifact<MissionDocument>;
  campaign: LocatedArtifact<CampaignDocument>;
} {
  const loopPath = findUp(root, "LOOP.md");
  if (!loopPath) throw new ArtifactParseError(resolve(root), "no LOOP.md found at or above root");
  const campaign = parseCampaignArtifact(readFileSync(loopPath, "utf8"), loopPath);
  if (campaign.document.mission_source) {
    throw new ArtifactParseError(
      loopPath,
      `external mission source ${campaign.document.mission_source.repository}@${campaign.document.mission_source.ref}:${campaign.document.mission_source.path} is not available in the current root`,
    );
  }
  const missionPath = findUp(dirname(loopPath), "MISSION.md");
  if (!missionPath) throw new ArtifactParseError(loopPath, "no parent MISSION.md found");
  const mission = parseMissionArtifact(readFileSync(missionPath, "utf8"), missionPath);
  return { mission, campaign };
}

export function loadMission(root: string): LocatedArtifact<MissionDocument> {
  const missionPath = findUp(root, "MISSION.md");
  if (!missionPath) throw new ArtifactParseError(resolve(root), "no MISSION.md found at or above root");
  return parseMissionArtifact(readFileSync(missionPath, "utf8"), missionPath);
}
