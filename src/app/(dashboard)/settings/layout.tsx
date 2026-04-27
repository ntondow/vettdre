import Header from "@/components/layout/header";
import { getCurrentOrgContext } from "@/lib/auth-context";
import SettingsSidebar from "./settings-sidebar";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentOrgContext();

  return (
    <>
      <Header title="Settings" />
      <div className="flex flex-col md:flex-row h-[calc(100vh-57px)]">
        <SettingsSidebar userEmail={ctx?.userEmail} userRole={ctx?.userRole} />
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="px-4 md:px-8 py-6 md:py-8">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
