import Header from "@/components/layout/header";
import { getContacts } from "./actions";
import ContactForm from "./contact-form";
import ContactList from "./contact-list";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const contacts = await getContacts({ overrideAsOrg: as_org });

  return (
    <>
      <Header title="Contacts" subtitle={`${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`} />
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div />
          <ContactForm />
        </div>

        {contacts.length > 0 ? (
          <ContactList contacts={contacts} />
        ) : (
          // Slate-zero — slice 10 / U-071 differentiation. The filter-narrowed
          // counterpart lives in contact-list.tsx (only renders when contacts
          // exist but typeFilter narrows them to zero); this branch only runs
          // when there are no contacts at all. CTA is implicit via the
          // ContactForm button at the page top, so no inline CTA here.
          <div data-testid="contacts-empty-zero" className="bg-white rounded-xl border border-slate-200 p-16 text-center">
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
