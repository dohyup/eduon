import { createHmac, timingSafeEqual } from "node:crypto";
export function signTestSession(
  userId: string,
  secret: string,
  expiresAt = Date.now() + 900000,
) {
  const body = `${userId}.${expiresAt}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
}
export function verifyTestSession(
  cookie: string,
  secret: string,
  now = Date.now(),
) {
  const [id, expiry, signature] = cookie.split(".");
  if (
    !/^[0-9a-f-]{36}$/.test(id || "") ||
    !/^\d+$/.test(expiry || "") ||
    Number(expiry) <= now ||
    !signature
  )
    return null;
  const expected = createHmac("sha256", secret)
    .update(`${id}.${expiry}`)
    .digest("hex");
  const a = Buffer.from(expected),
    b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
