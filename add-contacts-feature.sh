#!/bin/bash
# Run from inside your vettdre directory:
#   bash add-contacts-feature.sh

set -e
echo "🏗️  Adding Contacts feature..."

# ============================================================
# 1. SERVER ACTIONS FOR CONTACTS
# ============================================================
mkdir -p "src/app/(dashboard)/contacts"

echo "📦 Writing server actions..."
cat > "src/app/(dashboard)/contacts/actions.ts" << 'EOF'
"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Helper: get or create the user's org
async function getOrCreateUserOrg(authUser: { id: string; email?: string; user_metadata?: { full_name?: string } }) {
  // Check if user already exists in our DB
  let user = await prisma.user.findUnique({ where: { authProviderId: authUser.id }, include: { organization: true } });

  if (!user) {
    // First time: create org + user
    const org = await prisma.organization.create({
      data: {
        name: `${authUser.user_metadata?.full_name || "My"}'s Organization`,
        slug: `org-${authUser.id.slice(0, 8)}`,
      },
    });

    user = await prisma.user.create({
      data: {
        orgId: org.id,
        authProviderId: authUser.id,
        email: authUser.email || "",
        fullName: authUser.user_metadata?.full_name || "User",
        role: "owner",
      },
      include: { organization: true },
    });
  }

  return { user, org: user.organization };
}

export async function createContact(formData: FormData) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { user, org } = await getOrCreateUserOrg(authUser);

  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const city = formData.get("city") as string;
  const state = formData.get("state") as string;
  const source = formData.get("source") as string;
  const notes = formData.get("notes") as string;

  if (!firstName || !lastName) throw new Error("First and last name are required");

  await prisma.contact.create({
    data: {
      orgId: org.id,
      assignedTo: user.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      source: source?.trim() || null,
      notes: notes?.trim() || null,
      status: "lead",
    },
  });

  revalidatePath("/contacts");
  return { success: true };
}

export async function getContacts() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { org } = await getOrCreateUserOrg(authUser);

  return prisma.contact.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    include: { assignedAgent: { select: { fullName: true } } },
  });
}

export async function deleteContact(contactId: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const { org } = await getOrCreateUserOrg(authUser);

  await prisma.contact.deleteMany({
    where: { id: contactId, orgId: org.id },
  });

  revalidatePath("/contacts");
  return { success: true };
}
EOF

# ============================================================
# 2. ADD CONTACT FORM COMPONENT
# ============================================================
echo "📝 Writing contact form..."
cat > "src/app/(dashboard)/contacts/contact-form.tsx" << 'EOF'
"use client";

import { useState } from "react";
import { createContact } from "./actions";

export default function ContactForm({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      await createContact(formData);
      setOpen(false);
      e.currentTarget.reset();
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        + Add Contact
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Add New Contact</h2>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First name *</label>
              <input name="firstName" required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jane" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last name *</label>
              <input name="lastName" required className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Smith" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input name="email" type="email" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="jane@example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input name="phone" type="tel" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="(555) 123-4567" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input name="city" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="New York" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
              <input name="state" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="NY" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lead source</label>
            <select name="source" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select source...</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="zillow">Zillow</option>
              <option value="realtor.com">Realtor.com</option>
              <option value="streeteasy">StreetEasy</option>
              <option value="open_house">Open House</option>
              <option value="cold_call">Cold Call</option>
              <option value="social_media">Social Media</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea name="notes" rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Any initial notes about this contact..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">
              {loading ? "Saving..." : "Add Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
EOF

# ============================================================
# 3. CONTACT LIST COMPONENT
# ============================================================
echo "📋 Writing contact list..."
cat > "src/app/(dashboard)/contacts/contact-list.tsx" << 'EOF'
"use client";

import { useState } from "react";
import { deleteContact } from "./actions";
import { useRouter } from "next/navigation";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: string;
  source: string | null;
  qualificationScore: number | null;
  createdAt: Date;
}

export default function ContactList({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deleteContact(id);
      router.refresh();
    } finally {
      setDeleting(null);
    }
  };

  if (contacts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
            <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {contacts.map((contact) => (
            <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {contact.firstName[0]}{contact.lastName[0]}
                  </div>
                  <span className="text-sm font-medium text-slate-900">{contact.firstName} {contact.lastName}</span>
                </div>
              </td>
              <td className="px-5 py-3 text-sm text-slate-600">{contact.email || "—"}</td>
              <td className="px-5 py-3 text-sm text-slate-600">{contact.phone || "—"}</td>
              <td className="px-5 py-3 text-sm text-slate-600">
                {contact.city && contact.state ? `${contact.city}, ${contact.state}` : contact.city || contact.state || "—"}
              </td>
              <td className="px-5 py-3 text-sm text-slate-600">{contact.source || "—"}</td>
              <td className="px-5 py-3">
                {contact.qualificationScore !== null ? (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    contact.qualificationScore >= 80 ? "bg-emerald-50 text-emerald-700" :
                    contact.qualificationScore >= 60 ? "bg-amber-50 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {contact.qualificationScore}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Pending</span>
                )}
              </td>
              <td className="px-5 py-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                  {contact.status}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  onClick={() => handleDelete(contact.id, `${contact.firstName} ${contact.lastName}`)}
                  disabled={deleting === contact.id}
                  className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                >
                  {deleting === contact.id ? "..." : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
EOF

# ============================================================
# 4. UPDATED CONTACTS PAGE
# ============================================================
echo "📄 Updating contacts page..."
cat > "src/app/(dashboard)/contacts/page.tsx" << 'EOF'
import Header from "@/components/layout/header";
import { getContacts } from "./actions";
import ContactForm from "./contact-form";
import ContactList from "./contact-list";

export default async function ContactsPage() {
  const contacts = await getContacts();

  return (
    <>
      <Header title="Contacts" subtitle={`${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`} />
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div />
          <ContactForm />
        </div>

        {contacts.length > 0 ? (
          <ContactList contacts={contacts} />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
            <p className="text-4xl mb-4">👥</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No contacts yet</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              Add your first contact to get started. Enter their name and email, and VettdRE will be ready to build their AI profile.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
EOF

echo ""
echo "✅ Contacts feature added!"
echo ""
echo "Your app should auto-refresh. Go to http://localhost:3000/contacts"
echo "Click '+ Add Contact' to add your first lead!"
