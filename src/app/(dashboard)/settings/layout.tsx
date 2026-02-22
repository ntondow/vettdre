import Header from "@/components/layout/header";
import SettingsSidebar from "./settings-sidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header title="Settings" />
      <div className="flex flex-col md:flex-row h-[calc(100vh-57px)]">
        <SettingsSidebar />
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-[720px] mx-auto px-4 md:px-8 py-6 md:py-8">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
