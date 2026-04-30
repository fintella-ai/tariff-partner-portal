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
  icon?: string | null;
  isCustom?: boolean;
  status: StepStatus;
  done: boolean;
  videoUrl?: string | null;
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
  videoUrl?: string;
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
  partnerTypes?: string[];
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

export const DEFAULT_EXPECTATIONS_MARKDOWN = `## Your path to earning with Fintella

Welcome to the Fintella Financial Intelligence Network. Here's what success looks like as a referral partner:

- **Submit at least one qualified referral a month.** Consistency wins — partners who submit regularly close more deals and earn higher commissions over time.
- **Attend the Live Weekly call.** This is your direct line to product updates, winning strategies from top-performing partners, and live Q&A with leadership. Aim for at least one per month.
- **Respond to clients within 24 hours.** Your clients trust you. Fast follow-up keeps deals moving and protects your reputation.
- **Be honest about what Fintella does.** We connect businesses with vetted recovery providers — never overpromise outcomes. Let the experts handle the legal and procedural details.
- **Keep your profile and payout info up to date.** Accurate information means faster payouts and correct tax documents at year-end.
- **Stay reachable.** Check your portal notifications, respond to emails and texts, and keep your contact info current so commissions, approvals, and new opportunities never stall.

## How you earn

Your commission is a percentage of the professional fee collected on each successful recovery. When you refer a client and their claim is approved, you earn your agreed-upon rate — automatically tracked and calculated in your portal. If you recruit downline partners, you also earn override commissions on every deal they close.

You bring the relationships. We bring the platform, the recovery network, the workflow, and the payout. Let's build together.`;

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
    select: { partnerCode: true, status: true, onboardingState: true, partnerType: true },
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
    agreement?.status === "signed" || agreement?.status === "approved" || agreement?.status === "amended";
  const agreementPending =
    agreement?.status === "pending" || agreement?.status === "partner_signed";

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
      description: agreementSigned
        ? "Your partnership agreement is signed and active."
        : agreement?.status === "partner_signed"
        ? "Your signature is complete — awaiting Fintella co-signer to finalize."
        : agreement?.status === "pending"
        ? "Your agreement has been sent. Review and sign to activate your account."
        : "Review and e-sign your partnership agreement to activate your account. Once both you and Fintella sign, your portal unlocks and you can start submitting referrals immediately.",
      ctaLabel: agreementSigned ? "Signed ✓" : agreement?.status === "partner_signed" ? "Awaiting Co-sign" : agreementPending ? "Sign now" : "Sign now",
      ctaUrl: agreementCtaUrl,
      icon: "📝",
      status: agreementSigned ? "done" : agreementPending ? "ready" : "ready",
      done: agreementSigned,
    },
    {
      id: "complete_profile",
      title: "Complete your partner profile",
      description: "Go to Settings and fill in your full mailing address. This is required for accurate tax documents (1099) and ensures any rewards or materials reach you. Takes about one minute.",
      ctaLabel: profileComplete ? "Complete" : "Finish profile",
      ctaUrl: "/dashboard/settings?tab=address",
      icon: "👤",
      status: profileComplete ? "done" : locked ? "locked" : "ready",
      done: profileComplete,
    },
    {
      id: "add_payout",
      title: "Set up your payout method",
      description: "Choose how you want to get paid — bank transfer (ACH), wire, check, or PayPal. You won't receive commission payments until this is set up. Go to Settings → Payout Information to add your details.",
      ctaLabel: payoutComplete ? "Complete" : "Add payout info",
      ctaUrl: "/dashboard/settings?tab=payout",
      icon: "💸",
      status: payoutComplete ? "done" : locked ? "locked" : "ready",
      done: payoutComplete,
    },
    {
      id: "watch_video",
      title: "Watch the welcome video",
      description: "A quick walkthrough of the portal — how to navigate your dashboard, where to submit referrals, how to track your deals, and how commissions work. Watch it on your home page.",
      ctaLabel: videoWatched ? "Watched" : "Watch now",
      ctaUrl: "/dashboard/home",
      icon: "🎬",
      status: videoWatched ? "done" : locked ? "locked" : "ready",
      done: videoWatched,
    },
    {
      id: "join_call",
      title: "Join a Live Weekly call",
      description: "Every week, Fintella hosts a live training call where you'll hear product updates, learn proven referral strategies from top partners, and get your questions answered in real time. Check the schedule and join your first one.",
      ctaLabel: callJoined ? "Joined" : "Join this week",
      ctaUrl: "/dashboard/conference",
      icon: "📹",
      status: callJoined ? "done" : locked ? "locked" : "ready",
      done: callJoined,
    },
    {
      id: "complete_training",
      title: "Complete a training module",
      description: "Head to Partner Training and complete at least one module. Start with \"Understanding Tariff Recovery\" or \"How to Submit a Lead\" — they'll give you the knowledge you need to confidently talk to potential clients.",
      ctaLabel: trainingDone ? "Complete" : "Start training",
      ctaUrl: "/dashboard/training",
      icon: "📖",
      status: trainingDone ? "done" : locked ? "locked" : "ready",
      done: trainingDone,
    },
    {
      id: "share_link",
      title: "Share your referral link",
      description: "Go to Referral Links and copy your unique tracking URL. When you share this link with a potential client, their submission is automatically attributed to you so you get credit for the referral.",
      ctaLabel: linkShared ? "Shared" : "Copy your link",
      ctaUrl: "/dashboard/referral-links",
      icon: "🔗",
      status: linkShared ? "done" : locked ? "locked" : "ready",
      done: linkShared,
    },
    {
      id: "submit_client",
      title: "Submit your first client referral",
      description: "Ready to send a referral? Go to Submit Client, fill out the client's business information and estimated import value, and submit. You'll be able to track the deal's progress and your commission from the Reporting tab.",
      ctaLabel: hasDeal ? "Submitted" : "Submit a client",
      ctaUrl: "/dashboard/submit-client",
      icon: "✉️",
      status: hasDeal ? "done" : locked ? "locked" : "ready",
      done: hasDeal,
    },
    {
      id: "invite_downline",
      title: "Recruit your first downline partner",
      description: "Build your team and earn more. Go to Referral Links, create an invite for a downline partner at a rate below yours, and share the signup link. You'll earn an override commission on every deal they close — automatically.",
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
  const pType = partner.partnerType || "referral";
  const customSteps: ChecklistStep[] = customStepDefs
    .filter((c) => c && typeof c.id === "string" && c.id.startsWith("custom_"))
    .filter((c) => !c.partnerTypes?.length || c.partnerTypes.includes(pType))
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
      if (typeof o.videoUrl === "string" && o.videoUrl.trim())
        step.videoUrl = o.videoUrl;
      if (typeof o.order === "number" && Number.isFinite(o.order))
        explicitOrder.set(step.id, o.order);
    }
  }

  let visibleSteps = merged.filter((s) => {
    const o = overrides?.[s.id];
    return !(o && o.hidden === true);
  });
  // Safety: if overrides hide everything, fall back to all built-in steps
  if (visibleSteps.length === 0 && builtInSteps.length > 0) {
    visibleSteps = builtInSteps;
  }
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
