"use client";

interface Props {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "j", desc: "Next event" },
  { key: "k", desc: "Previous event" },
  { key: "Enter", desc: "Expand / collapse" },
  { key: "o", desc: "Open building profile" },
  { key: "w", desc: "Quick watch BBL" },
  { key: "/", desc: "Search" },
  { key: "Esc", desc: "Close panel / card" },
  { key: "?", desc: "Toggle this help" },
];

export default function KeyboardShortcutsHelp({ onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="fixed bottom-20 md:bottom-6 right-4 z-50 bg-[#161B22] border border-[#30363D] rounded-lg shadow-2xl p-4 w-64"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold text-[#E6EDF3] uppercase tracking-wider">Keyboard Shortcuts</h3>
        <button onClick={onClose} className="text-[#8B949E] hover:text-[#E6EDF3] text-xs">Esc</button>
      </div>
      <div className="space-y-1.5">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between">
            <span className="text-[11px] text-[#8B949E]">{s.desc}</span>
            <kbd className="text-[10px] font-mono bg-[#21262D] border border-[#30363D] text-[#E6EDF3] px-1.5 py-0.5 rounded min-w-[24px] text-center">
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
