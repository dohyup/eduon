import type { ServiceContext } from "./context";
export function appendAudit(
  ctx: ServiceContext,
  input: { action: string; targetId: string; reason?: string },
) {
  return ctx.db.auditEvent.create({
    data: {
      actorId: ctx.actor.userId,
      action: input.action,
      targetId: input.targetId,
      reason: input.reason?.slice(0, 500),
      createdAt: ctx.now(),
    },
  });
}
