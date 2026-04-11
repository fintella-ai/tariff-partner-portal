export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-theme-override">
      <style>{`
        .docs-theme-override {
          /* Override portal's forced dark body styles */
          background: #ffffff;
          color: #1a1a2e;
        }
        @media (prefers-color-scheme: dark) {
          .docs-theme-override {
            background: #060a18;
            color: rgba(255,255,255,0.9);
          }
        }
      `}</style>
      {children}
    </div>
  );
}
