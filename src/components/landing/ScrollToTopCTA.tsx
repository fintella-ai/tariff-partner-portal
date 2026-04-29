"use client";

export default function ScrollToTopCTA({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="inline-block px-8 py-3.5 rounded-xl font-semibold text-sm text-black"
      style={{ background: "#c4a050" }}
    >
      {label}
    </button>
  );
}
