export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.EDUON_DEPLOYMENT !== "production"
  )
    return;
  const { enforceDeployment } = await import("./server/release-gates");
  const { paymentReadiness } = await import("./integrations/payments/provider");
  const { videoReadiness } = await import("./integrations/video/provider");
  // Real storage/scanner and staging acceptance are intentionally not configured.
  enforceDeployment(process.env, {
    payments: paymentReadiness().configured,
    video: videoReadiness().configured,
    storage: false,
    scanner: false,
  });
}
