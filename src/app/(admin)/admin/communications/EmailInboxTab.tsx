"use client";
// Stub — the existing Inbox UI lives inside EmailTemplatesTab's internal tab bar
// for now. Follow-up spec will break this out.
export default function EmailInboxTab() {
  return (
    <div className="font-body text-sm text-[var(--app-text-muted)]">
      Email inbox is available under the Templates view (it preserves the existing
      inbound-email log). A dedicated inbox panel ships in a later phase.
    </div>
  );
}
