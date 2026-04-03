"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ShieldCheck, Mail, RefreshCw } from "lucide-react";

interface Props {
  maskedEmail: string;
  onVerified: () => void;
  onResend: () => Promise<void>;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string; remainingAttempts?: number }>;
}

export default function OtpStep({ maskedEmail, onVerified, onResend, onVerify }: Props) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    const fullCode = newDigits.join("");
    if (fullCode.length === 6 && newDigits.every((d) => d !== "")) {
      handleSubmit(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setDigits(newDigits);
    setError(null);

    // Focus last filled input
    const lastIndex = Math.min(pasted.length, 6) - 1;
    inputRefs.current[lastIndex]?.focus();

    // Auto-submit if all 6
    if (pasted.length === 6) {
      handleSubmit(pasted);
    }
  };

  const handleSubmit = useCallback(
    async (code: string) => {
      if (verifying) return;
      setVerifying(true);
      setError(null);

      try {
        const result = await onVerify(code);
        if (result.success) {
          onVerified();
        } else {
          setError(result.error || "Invalid code. Please try again.");
          // Clear inputs on failure
          setDigits(["", "", "", "", "", ""]);
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
      } catch {
        setError("Verification failed. Please try again.");
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
      } finally {
        setVerifying(false);
      }
    },
    [verifying, onVerify, onVerified],
  );

  const handleResend = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    setError(null);
    try {
      await onResend();
      setResendCooldown(30);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6 sm:py-8">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
        <ShieldCheck className="w-8 h-8 text-blue-600" />
      </div>

      {/* Heading */}
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
          Verify Your Identity
        </h1>
        <p className="text-sm text-slate-500 max-w-sm">
          We sent a 6-digit verification code to
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-1.5">
          <Mail className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">{maskedEmail}</span>
        </div>
      </div>

      {/* Code Input */}
      <div className="flex gap-2 sm:gap-3">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            disabled={verifying}
            className={`w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-lg border-2 transition-colors outline-none
              ${error
                ? "border-red-300 bg-red-50 text-red-700"
                : digit
                  ? "border-blue-500 bg-blue-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-900"
              }
              focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            aria-label={`Digit ${i + 1}`}
          />
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 max-w-sm text-center">
          {error}
        </div>
      )}

      {/* Verifying State */}
      {verifying && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
          Verifying...
        </div>
      )}

      {/* Resend */}
      <div className="text-center">
        <p className="text-xs text-slate-400 mb-2">
          Didn't receive the code? Check your spam folder.
        </p>
        <button
          onClick={handleResend}
          disabled={resending || resendCooldown > 0}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : resending
              ? "Sending..."
              : "Resend Code"
          }
        </button>
      </div>

      {/* Security Footer */}
      <div className="text-xs text-slate-400 text-center max-w-xs mt-2">
        This code expires in 10 minutes. For security, codes are single-use and limited to 5 attempts.
      </div>
    </div>
  );
}
