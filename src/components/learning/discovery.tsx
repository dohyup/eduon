import "server-only";
import { createHash } from "node:crypto";
import { getActor } from "@/integrations/auth/provider";
import { authConfigured, isDemoMode } from "@/server/config";
import { learningEnabled } from "@/modules/learning/access";
import { DiscoveryTracker } from "./discovery-tracker";

/** Optional measurement must never make public discovery depend on auth health. */
export async function LearningDiscovery({
  offeringIds,
  stage,
}: {
  offeringIds: string[];
  stage: "search" | "detail";
}) {
  if (
    !offeringIds.length ||
    isDemoMode() ||
    !authConfigured() ||
    !learningEnabled()
  )
    return null;
  let actor: Awaited<ReturnType<typeof getActor>>;
  try {
    actor = await getActor();
  } catch {
    return null;
  }
  if (!actor) return null;
  const scope = createHash("sha256")
    .update(actor.userId)
    .digest("hex")
    .slice(0, 16);
  return (
    <DiscoveryTracker offeringIds={offeringIds} stage={stage} scope={scope} />
  );
}
