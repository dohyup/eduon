import { handle } from "@/server/http";
import { learningEnabled } from "@/modules/learning/access";
import { videoReadiness } from "@/integrations/video/provider";
import {
  getStorageProvider,
  getFileScanner,
} from "@/integrations/storage/provider";
import { isTestAuthEnabled } from "@/server/config";
export function GET(r: Request) {
  return handle(r, async () => {
    let storageConfigured = false,
      scanningConfigured = false;
    try {
      getStorageProvider();
      storageConfigured = true;
      getFileScanner();
      scanningConfigured =
        process.env.STORAGE_PROVIDER === "fake" && isTestAuthEnabled();
    } catch {}
    return {
      ok: true,
      value: {
        enabled: learningEnabled(),
        videoConfigured: videoReadiness().configured,
        storageConfigured,
        scanningConfigured,
        testMode: isTestAuthEnabled(),
      },
    };
  });
}
