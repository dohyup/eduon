"use client";
import { useSyncExternalStore } from "react";
import { InvitationAccept } from "./live-workspace";
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
export function InvitationLanding({
  kind,
}: {
  kind: "student" | "instructor";
}) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token") || "";
  return <InvitationAccept key={token} kind={kind} token={token} />;
}
