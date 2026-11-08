import { redirect } from "next/navigation";
import { Checkout } from "@/components/commerce/checkout";
import { getActor } from "@/integrations/auth/provider";
import { paymentReadiness } from "@/integrations/payments/provider";

export default async function CheckoutResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getActor())) redirect("/login");
  return <Checkout orderId={id} readiness={paymentReadiness()} resultOnly />;
}
