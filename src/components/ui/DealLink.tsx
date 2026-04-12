"use client";

import { useRouter } from "next/navigation";

/**
 * Clickable deal name link — navigates to admin deals page and auto-expands the deal.
 * Renders as an inline element with gold hover underline to indicate clickability.
 */
export default function DealLink({
  dealId,
  children,
  className = "",
}: {
  dealId: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  if (!dealId) {
    return <span className={className}>{children}</span>;
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/admin/deals?deal=${dealId}`);
      }}
      className={`text-left hover:text-brand-gold hover:underline underline-offset-2 transition-colors cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}
