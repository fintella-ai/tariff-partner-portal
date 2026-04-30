import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CustomStep } from "@/lib/getting-started";

export const dynamic = "force-dynamic";

const BROKER_STEPS: CustomStep[] = [
  {
    id: "custom_broker_calculator",
    title: "Try the Tariff Calculator on a client",
    description: "Open the Tariff Calculator from your sidebar, enter one of your importer clients' data (country of origin, entry date, entered value), and see their estimated IEEPA refund. Takes 30 seconds — this is the tool you'll use to show clients what they're leaving on the table.",
    ctaLabel: "Open Calculator",
    ctaUrl: "/dashboard/calculator",
    icon: "🧮",
    doneWhen: "manual",
    order: 5,
    partnerTypes: ["customs_broker"],
  },
  {
    id: "custom_broker_pdf",
    title: "Generate a Client Summary PDF",
    description: "After running a calculation, click 'Generate Client Summary PDF' to create a professional Fintella-branded recovery analysis. This is your leave-behind — share it with the importer to close the deal. The PDF includes entry breakdown, audit score, deadlines, and next steps.",
    ctaLabel: "Generate PDF",
    ctaUrl: "/dashboard/calculator",
    icon: "📄",
    doneWhen: "manual",
    order: 6,
    partnerTypes: ["customs_broker"],
  },
  {
    id: "custom_broker_widget_setup",
    title: "Set up your TMS Widget",
    description: "Install the Fintella widget in your TMS (CargoWise, Magaya, or any web-based system). Go to TMS Widget in your sidebar, copy the embed code, and paste it into your TMS custom page or iframe. The widget lets your team submit referrals and run calculations without leaving your TMS.",
    ctaLabel: "Set Up Widget",
    ctaUrl: "/dashboard/widget",
    icon: "🔌",
    doneWhen: "manual",
    order: 7,
    partnerTypes: ["customs_broker"],
  },
  {
    id: "custom_broker_first_client",
    title: "Run a bulk analysis on your importer book",
    description: "Use Bulk Upload in the Tariff Calculator to upload a CSV of your clients' entry data. You can process up to 500 entries at once and see which clients have the biggest refund opportunities. Prioritize outreach to the highest-value importers first.",
    ctaLabel: "Bulk Upload",
    ctaUrl: "/dashboard/calculator",
    icon: "📊",
    doneWhen: "manual",
    order: 8,
    partnerTypes: ["customs_broker"],
  },
  {
    id: "custom_broker_cape_workflow",
    title: "Understand the CAPE filing workflow",
    description: "As a licensed customs broker, you can file CAPE declarations directly in the ACE Portal. The calculator generates a clean CAPE CSV file ready for upload. For entries that need legal review (rejected, complex, or CIT-eligible), submit them through the portal and our legal partner handles the rest.",
    ctaLabel: "Learn About CAPE",
    ctaUrl: "/dashboard/training",
    icon: "📋",
    doneWhen: "manual",
    order: 9,
    partnerTypes: ["customs_broker"],
  },
];

export async function POST(_req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (!role || !["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.portalSettings.findUnique({
    where: { id: "global" },
    select: { gettingStartedCustomSteps: true },
  });

  const existing: CustomStep[] = Array.isArray(settings?.gettingStartedCustomSteps)
    ? (settings!.gettingStartedCustomSteps as unknown as CustomStep[])
    : [];

  const existingIds = new Set(existing.map((s) => s.id));
  const newSteps = BROKER_STEPS.filter((s) => !existingIds.has(s.id));

  if (newSteps.length === 0) {
    return NextResponse.json({ seeded: 0, message: "Broker steps already exist" });
  }

  const merged = [...existing, ...newSteps];

  await prisma.portalSettings.upsert({
    where: { id: "global" },
    update: { gettingStartedCustomSteps: merged as unknown as object[] },
    create: { id: "global", gettingStartedCustomSteps: merged as unknown as object[] },
  });

  return NextResponse.json({ seeded: newSteps.length, steps: newSteps.map((s) => s.id) });
}
