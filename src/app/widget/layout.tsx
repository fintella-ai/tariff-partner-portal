import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fintella Partner Widget",
  robots: { index: false, follow: false },
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ maxWidth: 420 }}>
      {children}
    </div>
  );
}
