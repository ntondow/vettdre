"use client";

import { useEffect } from "react";

export default function TerminalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Terminal] Error:", error.message, error.stack, error.digest);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center bg-[#0D1117] text-[#E6EDF3]">
      <div className="text-center space-y-3">
        <p className="text-sm font-mono text-[#8B949E]">Terminal encountered an error</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-[#0A84FF] text-white text-sm font-semibold rounded hover:bg-[#0A84FF]/80 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
