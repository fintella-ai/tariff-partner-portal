import { redirect } from "next/navigation";

/**
 * /apply redirects to /login while the ClickFunnels-style rebuild is in
 * progress (see src/app/page.tsx for full context). The API it used to
 * post to (/api/apply) is still live and accepts intake from whatever
 * externally-built landing page replaces this.
 */
export default function ApplySqueezePage() {
  redirect("/login");
}
