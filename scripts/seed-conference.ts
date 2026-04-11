import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1 active upcoming call
  const upcoming = await prisma.conferenceSchedule.upsert({
    where: { id: "cs-week-13" },
    update: {},
    create: {
      id: "cs-week-13",
      title: "Weekly Partner Training & Q&A",
      description: "Product updates, training topics, success stories, and live Q&A.",
      joinUrl: "https://zoom.us/j/1234567890",
      schedule: "Every Thursday at 2:00 PM ET — 45-60 minutes",
      nextCall: new Date("2026-03-26T18:00:00.000Z"), // 2pm ET = 6pm UTC
      hostName: "TRLN Leadership Team",
      weekNumber: 13,
      isActive: true,
    },
  });
  console.log(`Upserted active: ${upcoming.id} — ${upcoming.title}`);

  // 7 past recordings (weeks 12 down to 6)
  const pastEntries = [
    {
      id: "cs-week-12",
      title: "Section 301 Update & New Partner Tools",
      hostName: "Sarah Mitchell",
      weekNumber: 12,
      nextCall: new Date("2026-03-19T18:00:00.000Z"),
      duration: "52 min",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      notes: "**Key Topics:**\n- Section 301 tariff updates effective April 1\n- New partner portal features walkthrough\n- Partner spotlight: How Mike S. closed 5 deals in one week\n\n**Action Items:**\n- Review updated Section 301 reference sheet in Resources\n- Try the new bulk lead submission feature\n- Submit Q1 performance reports by March 31",
    },
    {
      id: "cs-week-11",
      title: "Commission Deep Dive & Top Partner Q&A",
      hostName: "John Orlando",
      weekNumber: 11,
      nextCall: new Date("2026-03-12T18:00:00.000Z"),
      duration: "47 min",
      embedUrl: "https://www.youtube.com/embed/9bZkp7q19f0",
      notes: "**Key Topics:**\n- How L1, L2, and L3 commissions are calculated\n- Payout timeline walkthrough (filing → IRS → payment)\n- Q&A with top 3 partners on their lead generation strategies\n\n**Action Items:**\n- Review your commission dashboard for Q1 estimates\n- Set up direct deposit if you haven't already",
    },
    {
      id: "cs-week-10",
      title: "IEEPA Changes & Client Outreach Strategies",
      hostName: "Sarah Mitchell",
      weekNumber: 10,
      nextCall: new Date("2026-03-05T19:00:00.000Z"),
      duration: "58 min",
      embedUrl: "https://www.youtube.com/embed/LXb3EKWsInQ",
      notes: "**Key Topics:**\n- New IEEPA executive order implications for tariff recovery\n- Expanded eligibility criteria for importers\n- Effective cold outreach scripts for CPAs and trade advisors\n\n**Action Items:**\n- Download the updated Client Conversation Script\n- Identify 5 potential leads using the new eligibility criteria",
    },
    {
      id: "cs-week-9",
      title: "Onboarding Best Practices for New Partners",
      hostName: "TRLN Leadership Team",
      weekNumber: 9,
      nextCall: new Date("2026-02-26T19:00:00.000Z"),
      duration: "41 min",
      recordingUrl: "https://zoom.us/rec/share/example-week-9",
      notes: "**Key Topics:**\n- First 7 days as a TRLN partner — what to do\n- Portal walkthrough for new partners\n- Common mistakes to avoid when submitting leads\n\n**Action Items:**\n- Complete all Onboarding training modules\n- Submit your W-9 and partnership agreement",
    },
    {
      id: "cs-week-8",
      title: "Tax Season Strategies & Pipeline Management",
      hostName: "John Orlando",
      weekNumber: 8,
      nextCall: new Date("2026-02-19T19:00:00.000Z"),
      duration: "44 min",
      embedUrl: "https://www.youtube.com/embed/kJQP7kiw5Fk",
      notes: "**Key Topics:**\n- Leveraging tax season for client outreach\n- Managing your deal pipeline effectively\n- How to re-engage cold leads",
    },
    {
      id: "cs-week-7",
      title: "Building Your Downline — Advanced Recruiting",
      hostName: "Sarah Mitchell",
      weekNumber: 7,
      nextCall: new Date("2026-02-12T19:00:00.000Z"),
      duration: "55 min",
      embedUrl: "https://www.youtube.com/embed/RgKAFK5djSk",
      notes: "**Key Topics:**\n- L2 and L3 commission opportunities through recruiting\n- Where to find CPAs and trade advisors\n- Partner referral link best practices",
    },
    {
      id: "cs-week-6",
      title: "Product Knowledge Deep Dive — IEEPA & Section 301",
      hostName: "TRLN Leadership Team",
      weekNumber: 6,
      nextCall: new Date("2026-02-05T19:00:00.000Z"),
      duration: "49 min",
      recordingUrl: "https://zoom.us/rec/share/example-week-6",
      notes: "**Key Topics:**\n- Differences between IEEPA and Section 301 tariffs\n- Client qualification criteria for each program\n- Estimated refund calculations walkthrough",
    },
  ];

  for (const entry of pastEntries) {
    const result = await prisma.conferenceSchedule.upsert({
      where: { id: entry.id },
      update: {},
      create: {
        ...entry,
        description: `Week ${entry.weekNumber} partner call recording.`,
        isActive: false,
      },
    });
    console.log(`Upserted past: ${result.id} — Week ${entry.weekNumber}: ${entry.title}`);
  }

  console.log("\nSeed complete: 1 active + 7 past recordings.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
