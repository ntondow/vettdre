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
