import { errorText, UpgradeError } from "../errors.ts";
import {
  type DeferredReason,
  JSR_METADATA_URL,
  notPublishedMessage,
  type UpgradeDependencies,
} from "./types.ts";
import { isRecord, latestVersionFromMetadata } from "./versions.ts";

export class DeferredUpgradeError extends Error {
  readonly reason: DeferredReason;

  constructor(reason: DeferredReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeferredUpgradeError";
    this.reason = reason;
  }
}

export async function readLatestVersion(
  fetchMetadata: UpgradeDependencies["fetchMetadata"],
): Promise<string> {
  let response: Response;
  try {
    response = await fetchMetadata(JSR_METADATA_URL);
  } catch (error) {
    throw new DeferredUpgradeError(
      "unreachable",
      `Cannot reach JSR to check for updates: ${errorMessage(error)}.`,
      { cause: error },
    );
  }
  if (!response.ok) {
    if (response.status === 404) {
      // A deliberate deferral, not a failure: JSR publication follows the
      // first tagged Deno release (JSR_PUBLISH_ENABLED in release.yml), so
      // there is nothing for this command to compare against yet.
      throw new DeferredUpgradeError("not-published", notPublishedMessage());
    }
    throw new DeferredUpgradeError(
      "unreachable",
      `Cannot reach JSR to check for updates: HTTP ${response.status} ${response.statusText}.`,
    );
  }
  let metadata: unknown;
  try {
    metadata = await response.json();
  } catch (error) {
    throw new UpgradeError(
      `Invalid JSR package metadata: ${errorMessage(error)}.`,
      { cause: error },
    );
  }
  // A package can be registered and linked to its repository while carrying
  // no releases at all; JSR serves that as 200 with `latest: null` and an
  // empty `versions` map, so the 404 branch above never fires for the live
  // service. Treat the empty map as the same deferral, not as malformed
  // metadata.
  if (
    isRecord(metadata) && isRecord(metadata.versions) &&
    Object.keys(metadata.versions).length === 0
  ) {
    throw new DeferredUpgradeError("not-published", notPublishedMessage());
  }
  return latestVersionFromMetadata(metadata);
}

export function errorMessage(error: unknown): string {
  return errorText(error);
}
