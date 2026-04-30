import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fintella Partner Widget",
  robots: { index: false, follow: false },
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#060a14", color: "rgba(255,255,255,0.95)", maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  );
}
