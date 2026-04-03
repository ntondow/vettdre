import ScreeningWizardClient from "./client";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ScreeningWizardPage({ params }: Props) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-slate-50">
      <ScreeningWizardClient token={token} />
    </main>
  );
}
