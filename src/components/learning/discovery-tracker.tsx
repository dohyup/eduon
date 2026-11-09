"use client";
import { useEffect } from "react";
const pending = new Set<string>();
type Intent = { requestKey: string; sent: boolean };
export function DiscoveryTracker({
  offeringIds,
  stage,
  scope,
}: {
  offeringIds: string[];
  stage: "search" | "detail";
  scope: string;
}) {
  const signature = offeringIds.join(",");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || document.visibilityState !== "visible")
            continue;
          const offeringId = targets.get(entry.target);
          if (!offeringId) continue;
          observer.unobserve(entry.target);
          const key = `eduon-discovery:${scope}:${stage}:${offeringId}`;
          if (pending.has(key)) continue;
          let intent: Intent;
          try {
            const stored = sessionStorage.getItem(key);
            intent = stored
              ? (JSON.parse(stored) as Intent)
              : { requestKey: crypto.randomUUID(), sent: false };
            if (intent.sent) continue;
            sessionStorage.setItem(key, JSON.stringify(intent));
          } catch {
            continue;
          }
          pending.add(key);
          void fetch("/api/analytics/events", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              offeringId,
              stage,
              requestKey: intent.requestKey,
            }),
          })
            .then(async (response) => {
              if (!response.ok) return;
              const result = (await response.json()) as { ok?: boolean };
              if (result.ok)
                try {
                  sessionStorage.setItem(
                    key,
                    JSON.stringify({ ...intent, sent: true }),
                  );
                } catch {
                  /* Optional telemetry can stop when storage is unavailable. */
                }
            })
            .catch(() => {
              /* Do not interrupt discovery or retry in a loop. */
            })
            .finally(() => pending.delete(key));
        }
      },
      { threshold: 0.25 },
    );
    const targets = new Map<Element, string>();
    for (const offeringId of signature.split(",")) {
      const target =
        stage === "detail"
          ? document.querySelector("main h1")
          : document.querySelector(`a[href="/classes/${offeringId}"]`);
      if (target) {
        targets.set(target, offeringId);
        observer.observe(target);
      }
    }
    return () => observer.disconnect();
  }, [signature, stage, scope]);
  return null;
}
