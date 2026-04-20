"use client";
// Stub — the existing Compose UI lives inside EmailTemplatesTab's internal tab
// bar for now. Follow-up spec will break this out.
export default function EmailComposeTab() {
  return (
    <div className="font-body text-sm text-[var(--app-text-muted)]">
      Compose outbound email is available under the Templates view for now.
      A dedicated compose panel ships in a later phase.
    </div>
  );
}
