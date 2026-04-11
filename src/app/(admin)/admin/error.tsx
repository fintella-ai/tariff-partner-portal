"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <h3 className="font-display text-lg font-bold mb-1">Something went wrong</h3>
        <p className="font-body text-sm text-[var(--app-text-secondary)] max-w-sm">
          An error occurred while loading this page. Please try again.
        </p>
      </div>
      <button
        onClick={reset}
        className="btn-gold text-[12px] px-6 py-2.5"
      >
        Try Again
      </button>
    </div>
  );
}
