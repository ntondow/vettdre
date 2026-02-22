import Header from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import SettingsSidebar from "./settings-sidebar";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <Header title="Settings" />
      <div className="flex flex-col md:flex-row h-[calc(100vh-57px)]">
        <SettingsSidebar userEmail={user?.email} />
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-[720px] mx-auto px-4 md:px-8 py-6 md:py-8">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
