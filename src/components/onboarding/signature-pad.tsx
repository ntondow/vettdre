"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import SignaturePadLib from "signature_pad";
import { Eraser, Type, PenTool } from "lucide-react";

interface Props {
  onSignature: (dataUrl: string) => void;
  onClear: () => void;
  width?: number;
  height?: number;
  label?: string;
  disabled?: boolean;
}

const CURSIVE_FONT = "'Segoe Script', 'Bradley Hand', 'Brush Script MT', cursive";
const DRAW_DEBOUNCE_MS = 200;
const TYPE_DEBOUNCE_MS = 500;

export default function SignaturePad({
  onSignature,
  onClear,
  width = 400,
  height = 150,
  label = "Draw your signature below",
  disabled = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [captured, setCaptured] = useState(false);

  // Auto-emit (#8) — onSignature can change identity between parent renders,
  // but the init useEffect only re-runs on [isTyping, height, disabled] so we
  // can't depend on it directly without thrashing the canvas. Stash the
  // latest in a ref so the endStroke listener always emits the current one.
  const onSignatureRef = useRef(onSignature);
  useEffect(() => { onSignatureRef.current = onSignature; }, [onSignature]);

  // Render typed name → offscreen canvas → dataURL. Used by both the typed
  // auto-emit effect and the blur handler (immediate emit).
  const renderTypedSignature = useCallback((name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const container = containerRef.current;
    const cw = container?.clientWidth ?? 400;
    const offscreen = document.createElement("canvas");
    offscreen.width = Math.max(cw, 300);
    offscreen.height = 100;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, offscreen.width, 100);
    ctx.font = `32px ${CURSIVE_FONT}`;
    ctx.fillStyle = "rgb(20, 20, 60)";
    ctx.textBaseline = "middle";
    ctx.fillText(trimmed, 16, 50);
    return offscreen.toDataURL("image/png");
  }, []);

  // Initialize signature pad
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isTyping) return;

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(20, 20, 60)",
      minWidth: 1.5,
      maxWidth: 3,
    });

    if (disabled) pad.off();

    // Auto-emit on endStroke (#8) — debounced so the emit fires once after
    // the user stops drawing, not per-stroke. This eliminates the old
    // "Confirm Signature → Sign & Continue" two-button flow that confused
    // mobile users. The parent's "Sign & Continue" is now the single
    // primary CTA; this pad just keeps the parent's fieldValue in sync.
    let emitTimer: ReturnType<typeof setTimeout> | null = null;
    pad.addEventListener("endStroke", () => {
      const empty = pad.isEmpty();
      setHasDrawn(!empty);
      if (emitTimer) clearTimeout(emitTimer);
      if (empty) return;
      emitTimer = setTimeout(() => {
        onSignatureRef.current(pad.toDataURL("image/png"));
        setCaptured(true);
      }, DRAW_DEBOUNCE_MS);
    });

    padRef.current = pad;

    // Size canvas to container. Mobile orientation rotation fires resize,
    // which used to wipe in-progress signatures — snapshot before clear and
    // rehydrate after so the user doesn't have to redraw.
    const resize = () => {
      const container = containerRef.current;
      if (!container) return;
      const snapshot = !pad.isEmpty() ? pad.toDataURL() : null;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = container.clientWidth;
      const h = Math.min(height, 200);
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      if (snapshot) {
        pad.fromDataURL(snapshot);
        setHasDrawn(true);
      } else {
        setHasDrawn(false);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      pad.off();
      if (emitTimer) clearTimeout(emitTimer);
      window.removeEventListener("resize", resize);
      padRef.current = null;
    };
  }, [isTyping, height, disabled]);

  // Auto-emit on typed name change (#8) — debounced so we don't spam the
  // parent on every keystroke. Blur emits immediately for "I'm done" feel.
  useEffect(() => {
    if (!isTyping || disabled) return;
    if (!typedName.trim()) return;
    const t = setTimeout(() => {
      const dataUrl = renderTypedSignature(typedName);
      if (dataUrl) {
        onSignatureRef.current(dataUrl);
        setCaptured(true);
      }
    }, TYPE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typedName, isTyping, disabled, renderTypedSignature]);

  const handleTypedBlur = useCallback(() => {
    if (disabled || !typedName.trim()) return;
    const dataUrl = renderTypedSignature(typedName);
    if (dataUrl) {
      onSignatureRef.current(dataUrl);
      setCaptured(true);
    }
  }, [typedName, disabled, renderTypedSignature]);

  // Clear handler
  const handleClear = useCallback(() => {
    if (isTyping) {
      setTypedName("");
    } else {
      padRef.current?.clear();
      setHasDrawn(false);
    }
    setCaptured(false);
    onClear();
  }, [isTyping, onClear]);

  const canDraw = isTyping ? typedName.trim().length > 0 : hasDrawn;

  return (
    <div className="space-y-2.5 sm:space-y-3">
      {/* Label + mode toggle */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700 truncate">{label}</span>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 active:text-slate-900 py-1.5 px-2 -my-1 rounded-md"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsTyping(!isTyping);
              handleClear();
            }}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {isTyping ? (
              <>
                <PenTool className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Draw Instead</span>
                <span className="sm:hidden">Draw</span>
              </>
            ) : (
              <>
                <Type className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Type Instead</span>
                <span className="sm:hidden">Type</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Signing area */}
      <div
        ref={containerRef}
        className={`rounded-lg border-2 border-dashed overflow-hidden ${
          disabled
            ? "border-slate-200 bg-slate-50"
            : "border-slate-300 bg-white"
        }`}
      >
        {isTyping ? (
          <div
            className="flex items-center justify-center p-4 sm:p-6"
            style={{ minHeight: `${Math.min(height, 150)}px` }}
          >
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              onBlur={handleTypedBlur}
              placeholder="Type your full name"
              disabled={disabled}
              autoComplete="name"
              className="w-full border-b-2 border-slate-300 bg-transparent px-2 py-3 text-center text-xl sm:text-2xl text-slate-800 outline-none focus:border-blue-500"
              style={{ fontFamily: CURSIVE_FONT }}
            />
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className={`touch-none ${disabled ? "cursor-not-allowed" : "cursor-crosshair"}`}
          />
        )}
      </div>

      {/* Preview of typed signature */}
      {isTyping && typedName.trim() && (
        <div className="rounded-lg bg-slate-50 px-4 py-2.5 sm:py-3 text-center">
          <span className="text-[11px] text-slate-400 block mb-1">Preview</span>
          <span
            className="text-xl sm:text-2xl text-slate-800"
            style={{ fontFamily: CURSIVE_FONT }}
          >
            {typedName}
          </span>
        </div>
      )}

      {/* Status — replaces the old "Confirm Signature" button (#8). The pad
          auto-emits when the user stops drawing or finishes typing; the
          parent's "Sign & Continue" is now the single primary CTA.
          aria-live announces capture for screen readers. */}
      <div
        role="status"
        aria-live="polite"
        className="text-center text-xs"
      >
        {captured && canDraw ? (
          <span className="text-emerald-600">Signature captured</span>
        ) : (
          <span className="text-slate-400">
            {isTyping ? "Type your name above" : "Draw your signature above"}
          </span>
        )}
      </div>
    </div>
  );
}
