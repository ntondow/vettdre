// ============================================================
// Hosted Chat Page — /chat/[configSlug]
//
// Public page — no auth required.
// Displays pre-chat form, then full chat UI.
// ============================================================

import prisma from "@/lib/prisma";
import ChatWidget from "./chat-widget";

interface Props {
  params: Promise<{ configSlug: string }>;
}

export default async function ChatPage({ params }: Props) {
  const { configSlug } = await params;

  const config = await prisma.leasingConfig.findFirst({
    where: { slug: configSlug, isActive: true, webChatEnabled: true },
    select: {
      id: true,
      slug: true,
      aiName: true,
      property: { select: { name: true, address: true } },
    },
  });

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">This chat is not available</p>
          <p className="text-sm text-slate-500">The property chat may have been disabled or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  const buildingName = config.property.name || config.property.address || "Property";

  return (
    <ChatWidget
      configSlug={configSlug}
      buildingName={buildingName}
      aiName={config.aiName}
    />
  );
}
