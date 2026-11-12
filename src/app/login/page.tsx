import { AuthPanel } from "@/components/auth-panel";
import { authConfigured } from "@/server/config";

export default function Page() {
  return <AuthPanel mode="login" configured={authConfigured()} />;
}
