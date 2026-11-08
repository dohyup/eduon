import { AccountDemo } from "@/components/workspace";
import { AuthPanel } from "@/components/auth-panel";
import { isDemoMode, authConfigured } from "@/server/config";
export default function Page() {
  return isDemoMode() ? (
    <AccountDemo mode="login" />
  ) : (
    <AuthPanel mode="login" configured={authConfigured()} />
  );
}
