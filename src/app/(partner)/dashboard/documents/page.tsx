"use client";

import DocumentsView from "@/components/partner/DocumentsView";

// Documents has moved into Full Reporting as its rightmost tab. This
// standalone route stays alive so existing bookmarks / notification
// deep-links keep working — it just mounts the same DocumentsView
// component the Reporting page uses under the Documents tab.
export default function DocumentsPage() {
  return <DocumentsView />;
}
