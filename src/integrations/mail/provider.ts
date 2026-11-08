import "server-only";
import { appOrigin } from "@/server/config";
import { createHash } from "node:crypto";
import { z } from "zod";
// Manual delivery is explicit until the operator selects an email provider.
export function invitationDelivery(
  kind: "student" | "instructor",
  token: string,
) {
  return {
    inviteUrl: `${appOrigin()}/invitations?kind=${kind}#token=${encodeURIComponent(token)}`,
    delivery: "manual" as const,
  };
}
export async function deliverInvitation(
  kind: "student" | "instructor",
  token: string,
  recipient: string,
) {
  const value = invitationDelivery(kind, token);
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return value;
  try {
    z.email().parse(recipient);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": createHash("sha256")
          .update(kind + token)
          .digest("hex"),
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [recipient],
        subject:
          kind === "student"
            ? "EDUON 학생 계정 연결 초대"
            : "EDUON 강사 소속 초대",
        text: `초대받은 이메일로 로그인한 후 아래 링크를 확인하세요. 초대는 24시간 동안 한 번만 사용할 수 있습니다.\n${value.inviteUrl}\n요청하지 않은 초대라면 사용하지 마세요.`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ...value, delivery: "failed" as const };
    const data = await response.json();
    if (typeof data.id !== "string")
      return { ...value, delivery: "failed" as const };
    return { delivery: "sent" as const };
  } catch {
    return { ...value, delivery: "failed" as const };
  }
}
