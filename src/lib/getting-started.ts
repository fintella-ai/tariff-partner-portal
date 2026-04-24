import { prisma } from "@/lib/prisma";

/**
 * Partner Getting-Started checklist engine.
 *
 * Two sources of truth:
 *   1. Real DB signals (agreement status, deal count, downline count, profile
 *      + payout fields, stripe status) — authoritative, can't be faked.
 *   2. `Partner.onboardingState` JSON — supplementary timestamps for actions
 *      the DB doesn't otherwise track (watched video, joined first call,
 *      completed a training module, shared referral link).
 *
 * Completion = all 9 steps done. Once complete, `onboardingState.completedAt`
 * is stamped and the checklist auto-hides on home (still reachable via the
 * /dashboard/getting-started route).
 */

export type StepStatus = "done" | "ready" | "locked";

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  icon?: string | null;       // emoji or /icons/xxx.svg path; null = renderer uses a generic marker
  isCustom?: boolean;          // true for admin-authored steps (beyond the 9 built-ins)
  status: StepStatus;
  done: boolean;
}

export type BuiltInStepId =
  | "sign_agreement"
  | "complete_profile"
  | "add_payout"
  | "watch_video"
  | "join_call"
  | "complete_training"
  | "share_link"
  | "submit_client"
  | "invite_downline";

/** @deprecated retained for backward-compat; use `string` or BuiltInStepId. */
export type StepId = BuiltInStepId;

/** Shape of an entry in `PortalSettings.gettingStartedStepOverrides`. All fields
 *  optional. When `hidden=true`, the step is filtered out entirely. */
export interface StepOverride {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  icon?: string;
  hidden?: boolean;
  order?: number;
}

/** Shape of an entry in `PortalSettings.gettingStartedCustomSteps`. */
export interface CustomStep {
  id: string;            // "custom_<slug>"
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  icon?: string;
  doneWhen?: "never" | "manual";
  order?: number;
}

export interface OnboardingState {
  dismissed?: boolean;
  watchedWelcomeVideoAt?: string;
  firstCallJoinedAt?: string;
  firstTrainingCompletedAt?: string;
  referralLinkSharedAt?: string;
  completedAt?: string;
  // Throttle for the partner.onboarding_stalled cron trigger. Written by
  // /api/cron/reminders after each nudge fire so the next run skips the
  // partner until the workflow's cadence window elapses.
  lastNudgeSentAt?: string;
}

export interface GettingStartedResult {
  steps: ChecklistStep[];
  progressPercent: number;
  completedCount: number;
  totalCount: number;
  dismissed: boolean;
  expectationsMarkdown: string;
}

export const DEFAULT_EXPECTATIONS_MARKDOWN = `## What it means to be a Fintella partner

As a Fintella referral partner, we ask a few things of you so we can earn together:

- **Aim for at least one qualified referral a month.** Steady activity beats sporadic bursts — consistent partners close more deals.
- **Join our Live Weekly calls.** Once a week is ideal. This is where you hear about new offers, ask questions, and learn what's working for other partners.
- **Respond to your clients within 24 hours.** They chose you because they trust you. Keep the trust by being responsive.
- **Represent Fintella honestly.** Don't overpromise outcomes; let our vetted partner providers close the loop with the legal and procedural detail.
- **Keep your profile and payout info current.** We pay you fast when we have accurate information on file.
- **Stay in touch.** Respond to our emails and SMS so commissions, approvals, and new opportunities never get stuck.

You bring the relationships. We bring the platform, the partner firms, the workflow, and the payout. Let's build.`;

export function parseOnboardingState(raw: string | null | undefined): OnboardingState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as OnboardingState;
    }
    return {};
  } catch {
    return {};
  }
}

export function serializeOnboardingState(state: OnboardingState): string {
  return JSON.stringify(state);
}

type StateAction =
  | "dismiss"
  | "undismiss"
  | "mark_video_watched"
  | "mark_call_joined"
  | "mark_training_completed"
  | "mark_link_shared";

export function applyAction(state: OnboardingState, action: StateAction): OnboardingState {
  const now = new Date().toISOString();
  switch (action) {
    case "dismiss": return { ...state, dismissed: true };
    case "undismiss": return { ...state, dismissed: false };
    case "mark_video_watched": return { ...state, watchedWelcomeVideoAt: state.watchedWelcomeVideoAt || now };
    case "mark_call_joined": return { ...state, firstCallJoinedAt: state.firstCallJoinedAt || now };
    case "mark_training_completed": return { ...state, firstTrainingCompletedAt: state.firstTrainingCompletedAt || now };
    case "mark_link_shared": return { ...state, referralLinkSharedAt: state.referralLinkSharedAt || now };
  }
}

/**
 * Compute the full checklist for a partner. Returns a deterministic result
 * that the API route + UI both consume.
 */
export async function computeGettingStarted(partnerCode: string): Promise<GettingStartedResult> {
  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { partnerCode: true, status: true, onboardingState: true },
  });
  if (!partner) {
    return emptyResult();
  }

  const state = parseOnboardingState(partner.onboardingState);

  const [agreement, profile, stripe, dealCount, downlineCount, inviteCount, settings] = await Promise.all([
    prisma.partnershipAgreement.findFirst({
      where: { partnerCode },
      orderBy: { createdAt: "desc" },
      select: { status: true, embeddedSigningUrl: true },
    }),
    prisma.partnerProfile.findUnique({
      where: { partnerCode },
      select: { street: true, city: true, state: true, zip: true, payoutMethod: true, bankName: true, accountNumber: true, routingNumber: true, paypalEmail: true },
    }),
    prisma.stripeAccount.findUnique({
      where: { partnerCode },
      select: { status: true },
    }).catch(() => null),
    prisma.deal.count({ where: { partnerCode } }),
    prisma.partner.count({ where: { referredByPartnerCode: partnerCode } }),
    prisma.recruitmentInvite.count({ where: { inviterCode: partnerCode } }),
    prisma.portalSettings.findUnique({
      where: { id: "global" },
      select: {
        gettingStartedExpectations: true,
        gettingStartedStepOverrides: true,
        gettingStartedCustomSteps: true,
      },
    }),
  ]);

  const agreementSigned =
    partner.status === "active" ||
    (agreement?.status === "signed" || agreement?.status === "amended");

  const profileComplete = !!(profile?.street && profile?.city && profile?.state && profile?.zip);

  const payoutComplete = (() => {
    if (stripe?.status === "active") return true;
    if (!profile?.payoutMethod) return false;
    if (profile.payoutMethod === "wire" || profile.payoutMethod === "ach") {
      return !!(profile.bankName && profile.accountNumber && profile.routingNumber);
    }
    if (profile.payoutMethod === "check") return true;
    if (profile.payoutMethod === "paypal") return !!profile.paypalEmail;
    return false;
  })();

  const videoWatched = !!state.watchedWelcomeVideoAt;
  const callJoined = !!state.firstCallJoinedAt;
  const trainingDone = !!state.firstTrainingCompletedAt;
  const linkShared = !!state.referralLinkSharedAt;
  const hasDeal = dealCount > 0;
  const hasDownline = downlineCount > 0 || inviteCount > 0;

  const locked = !agreementSigned;
  const agreementCtaUrl = agreement?.embeddedSigningUrl || "/dashboard/deals";

  const builtInSteps: ChecklistStep[] = [
    {
      id: "sign_agreement",
      title: "Sign your Partnership Agreement",
      description: "Your partnership goes live the moment both signatures are on the document.",
      ctaLabel: agreementSigned ? "Signed" : "Sign now",
      ctaUrl: agreementCtaUrl,
      icon: "📝",
      status: agreementSigned ? "done" : "ready",
      done: agreementSigned,
    },
    {
      id: "complete_profile",
      title: "Complete your profile",
      description: "Add your address so we can generate accurate tax forms and ship any rewards.",
      ctaLabel: profileComplete ? "Complete" : "Finish profile",
      ctaUrl: "/dashboard/settings?tab=address",
      icon: "👤",
      status: profileComplete ? "done" : locked ? "locked" : "ready",
      done: profileComplete,
    },
    {
      id: "add_payout",
      title: "Add your payout info",
      description: "Bank, ACH, check, or PayPal. We can't pay you until this is set.",
      ctaLabel: payoutComplete ? "Complete" : "Add payout info",
      ctaUrl: "/dashboard/settings?tab=payout",
      icon: "💸",
      status: payoutComplete ? "done" : locked ? "locked" : "ready",
      done: payoutComplete,
    },
    {
      id: "watch_video",
      title: "Watch the welcome video",
      description: "A two-minute tour of the portal and how referrals flow through Fintella.",
      ctaLabel: videoWatched ? "Watched" : "Watch now",
      ctaUrl: "/dashboard/home",
      icon: "🎬",
      status: videoWatched ? "done" : locked ? "locked" : "ready",
      done: videoWatched,
    },
    {
      id: "join_call",
      title: "Join a Live Weekly call",
      description: "This is where you actually learn the product. Join one this week.",
      ctaLabel: callJoined ? "Joined" : "Join this week",
      ctaUrl: "/dashboard/conference",
      icon: "📹",
      status: callJoined ? "done" : locked ? "locked" : "ready",
      done: callJoined,
    },
    {
      id: "complete_training",
      title: "Complete a training module",
      description: "Pick any module in Partner Training to build your referral playbook.",
      ctaLabel: trainingDone ? "Complete" : "Start training",
      ctaUrl: "/dashboard/training",
      icon: "📖",
      status: trainingDone ? "done" : locked ? "locked" : "ready",
      done: trainingDone,
    },
    {
      id: "share_link",
      title: "Share your referral link",
      description: "Your unique link tracks every client you send our way.",
      ctaLabel: linkShared ? "Shared" : "Copy your link",
      ctaUrl: "/dashboard/referral-links",
      icon: "🔗",
      status: linkShared ? "done" : locked ? "locked" : "ready",
      done: linkShared,
    },
    {
      id: "submit_client",
      title: "Submit your first client",
      description: "Use the Submit Client form whenever you're ready to send a warm lead over.",
      ctaLabel: hasDeal ? "Submitted" : "Submit a client",
      ctaUrl: "/dashboard/submit-client",
      icon: "✉️",
      status: hasDeal ? "done" : locked ? "locked" : "ready",
      done: hasDeal,
    },
    {
      id: "invite_downline",
      title: "Invite your first downline partner",
      description: "Earn override commissions on every deal your recruits close.",
      ctaLabel: hasDownline ? "Invited" : "Invite a partner",
      ctaUrl: "/dashboard/referral-links",
      icon: "👥",
      status: hasDownline ? "done" : locked ? "locked" : "ready",
      done: hasDownline,
    },
  ];

  // Admin-authored custom steps. Each carries its own full content + CTA +
  // icon; status is either always "ready" (doneWhen=never) or flipped
  // manually by the admin via the partner detail page (doneWhen=manual —
  // marker persisted on Partner.onboardingState under a custom key).
  const customStepDefs: CustomStep[] = Array.isArray(settings?.gettingStartedCustomSteps)
    ? ((settings!.gettingStartedCustomSteps as unknown) as CustomStep[])
    : [];
  const customSteps: ChecklistStep[] = customStepDefs
    .filter((c) => c && typeof c.id === "string" && c.id.startsWith("custom_"))
    .map((c) => {
      const manualKey = `custom_done_${c.id}`;
      const manuallyDone =
        c.doneWhen === "manual" && !!(state as Record<string, unknown>)[manualKey];
      return {
        id: c.id,
        title: c.title || "(custom step)",
        description: c.description || "",
        ctaLabel: c.ctaLabel || "Open",
        ctaUrl: c.ctaUrl || "/dashboard",
        icon: c.icon || "⭐",
        isCustom: true,
        status: manuallyDone ? ("done" as const) : locked ? ("locked" as const) : ("ready" as const),
        done: manuallyDone,
      };
    });

  // Merge built-ins + custom, apply overrides, filter hidden, sort by
  // explicit `order` (ties broken by built-in declaration order).
  const overrides = (settings?.gettingStartedStepOverrides ?? null) as Record<
    string,
    StepOverride | undefined
  > | null;

  const merged: ChecklistStep[] = [...builtInSteps, ...customSteps];
  const explicitOrder = new Map<string, number>();
  merged.forEach((s, i) => explicitOrder.set(s.id, i)); // declaration order default

  if (overrides) {
    for (const step of merged) {
      const o = overrides[step.id];
      if (!o) continue;
      if (typeof o.title === "string" && o.title.trim()) step.title = o.title;
      if (typeof o.description === "string" && o.description.trim())
        step.description = o.description;
      // CTA overrides only take effect for built-ins that don't have
      // computed-state-tied CTAs — but we're permissive: admin knows what
      // they're doing. The built-in status logic stays authoritative;
      // only the label + url strings swap.
      if (typeof o.ctaLabel === "string" && o.ctaLabel.trim())
        step.ctaLabel = o.ctaLabel;
      if (typeof o.ctaUrl === "string" && o.ctaUrl.trim())
        step.ctaUrl = o.ctaUrl;
      if (typeof o.icon === "string" && o.icon.trim())
        step.icon = o.icon;
      if (typeof o.order === "number" && Number.isFinite(o.order))
        explicitOrder.set(step.id, o.order);
    }
  }

  const visibleSteps = merged.filter((s) => {
    const o = overrides?.[s.id];
    return !(o && o.hidden === true);
  });
  visibleSteps.sort((a, b) => {
    const ao = explicitOrder.get(a.id) ?? 999;
    const bo = explicitOrder.get(b.id) ?? 999;
    return ao - bo;
  });

  const completedCount = visibleSteps.filter((s) => s.done).length;
  const totalCount = visibleSteps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const steps = visibleSteps;

  return {
    steps,
    progressPercent,
    completedCount,
    totalCount,
    dismissed: !!state.dismissed,
    expectationsMarkdown: settings?.gettingStartedExpectations || DEFAULT_EXPECTATIONS_MARKDOWN,
  };
}

/**
 * Apply a state action and stamp `completedAt` when the partner hits 100%.
 */
export async function updateOnboardingState(
  partnerCode: string,
  action: StateAction
): Promise<GettingStartedResult> {
  const partner = await prisma.partner.findUnique({
    where: { partnerCode },
    select: { onboardingState: true },
  });
  if (!partner) return emptyResult();

  const current = parseOnboardingState(partner.onboardingState);
  const next = applyAction(current, action);

  await prisma.partner.update({
    where: { partnerCode },
    data: { onboardingState: serializeOnboardingState(next) },
  });

  const result = await computeGettingStarted(partnerCode);

  // Stamp completedAt exactly once when the partner first hits 100%.
  if (result.completedCount === result.totalCount && !next.completedAt) {
    const stamped = { ...next, completedAt: new Date().toISOString() };
    await prisma.partner.update({
      where: { partnerCode },
      data: { onboardingState: serializeOnboardingState(stamped) },
    });
  }

  return result;
}

function emptyResult(): GettingStartedResult {
  return {
    steps: [],
    progressPercent: 0,
    completedCount: 0,
    totalCount: 0,
    dismissed: false,
    expectationsMarkdown: DEFAULT_EXPECTATIONS_MARKDOWN,
  };
}
