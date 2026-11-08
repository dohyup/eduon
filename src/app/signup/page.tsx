import { AccountDemo } from "@/components/workspace";
import { AuthPanel } from "@/components/auth-panel";
import { isDemoMode, authConfigured } from "@/server/config";
export default function Page() {
  return isDemoMode() ? (
    <AccountDemo mode="signup" />
  ) : (
    <AuthPanel
      mode="signup"
      configured={authConfigured()}
      signupAllowed={
        process.env.AUTH_ALLOW_SIGNUP === "true" &&
        !!process.env.PRIVACY_POLICY_VERSION
      }
    />
  );
}
