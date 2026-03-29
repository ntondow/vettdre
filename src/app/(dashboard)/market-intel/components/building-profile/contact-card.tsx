"use client";

// Single contact card with phone/email/confidence
// Phone numbers large and tappable with tel: links and Call/SMS buttons

interface ContactData {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  confidence?: number;
  source?: string;
}

interface Props {
  contact: ContactData;
  onSmsClick?: (phone: string, name?: string) => void;
}

function fmtPhone(ph: string): string {
  const d = ph.replace(/\D/g, "");
  const n = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  if (n.length === 10) return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  return ph;
}

export default function ContactCard({ contact, onSmsClick }: Props) {
  const { name, role, phone, email, confidence, source } = contact;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{name}</span>
          {role && (
            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {role}
            </span>
          )}
        </div>
        {confidence != null && confidence > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            confidence >= 70 ? "bg-emerald-100 text-emerald-700"
              : confidence >= 40 ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-500"
          }`}>
            {confidence}%
          </span>
        )}
      </div>

      {/* Phone — large, tappable */}
      {phone && (
        <div className="flex items-center gap-2 mb-1">
          <a
            href={`tel:${phone}`}
            className="text-base font-medium text-slate-900 hover:text-blue-600 transition-colors"
          >
            {fmtPhone(phone)}
          </a>
          <a
            href={`tel:${phone}`}
            className="px-2 py-1 text-[10px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors min-h-[28px] flex items-center"
          >
            Call
          </a>
          {onSmsClick && (
            <button
              onClick={() => onSmsClick(phone, name)}
              className="px-2 py-1 text-[10px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors min-h-[28px] flex items-center"
            >
              SMS
            </button>
          )}
        </div>
      )}

      {/* Email */}
      {email && (
        <div className="flex items-center gap-2">
          <a
            href={`mailto:${email}`}
            className="text-xs text-slate-600 hover:text-blue-600 transition-colors truncate"
          >
            {email}
          </a>
          <a
            href={`mailto:${email}`}
            className="px-2 py-0.5 text-[10px] font-semibold border border-slate-300 text-slate-600 rounded hover:bg-slate-100 transition-colors"
          >
            Email
          </a>
        </div>
      )}

      {/* Source badge */}
      {source && (
        <div className="mt-1.5">
          <span className="text-[9px] text-slate-400">{source}</span>
        </div>
      )}
    </div>
  );
}
