import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  let isLive = false;
  try {
    const settings = await prisma.portalSettings.findUnique({ where: { id: "global" } });
    isLive = !!(settings as any)?.landingV2Live;
  } catch {}

  if (isLive) {
    redirect("/landing-v2");
  }
  redirect("/login");
}
