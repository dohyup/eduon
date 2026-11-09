import { expect, it } from "vitest";
import { authLinkMessage } from "../../src/contracts/auth-link-message";
it("explains an expired or consumed email link without reflecting provider text", () => {
  const text = authLinkMessage(
    "?error=callback",
    "#error_code=otp_expired&error_description=%3Cscript%3Eprivate%3C/script%3E",
  );
  expect(text).toContain("이미 사용");
  expect(text).toContain("만료");
  expect(text).not.toContain("private");
  expect(text).not.toContain("script");
});
it("explains a failed browser callback and ignores unrelated URL values", () => {
  expect(authLinkMessage("?error=callback", "")).toContain("같은 브라우저");
  expect(
    authLinkMessage("?code=private-code", "#access_token=private-token"),
  ).toBe("");
});
