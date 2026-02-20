"use client";

interface Template {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  category: string | null;
}

interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string | null;
}

function replaceMergeFields(body: string, contact: ContactInfo | null): string {
  if (!contact) return body;
  return body
    .replace(/\{\{first_name\}\}/gi, contact.firstName || "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName || "")
    .replace(/\{\{email\}\}/gi, contact.email || "")
    .replace(/\{\{full_name\}\}/gi, `${contact.firstName || ""} ${contact.lastName || ""}`.trim());
}

export default function QuickReplyBar({
  templates,
  contact,
  onSelect,
}: {
  templates: Template[];
  contact: ContactInfo | null;
  onSelect: (body: string) => void;
}) {
  // Show quick_reply category templates, or first 5 templates
  const quickReplies = templates.filter(t => t.category === "quick_reply").length > 0
    ? templates.filter(t => t.category === "quick_reply").slice(0, 5)
    : templates.slice(0, 5);

  if (quickReplies.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-t border-slate-100 bg-slate-50 overflow-x-auto">
      <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">Quick:</span>
      {quickReplies.map(t => (
        <button key={t.id}
          onClick={() => onSelect(replaceMergeFields(t.body, contact))}
          className="px-2.5 py-1 bg-white border border-slate-200 rounded-full text-[11px] font-medium text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap flex-shrink-0 transition-colors">
          {t.name}
        </button>
      ))}
    </div>
  );
}
