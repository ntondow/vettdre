import prisma from "@/lib/prisma";
import BookingView from "./booking-view";

async function getShowingData(slug: string) {
  // Slug format: "propertyaddress" (url-safe version)
  // Find all upcoming, unbooked slots matching this property
  const allSlots = await prisma.showingSlot.findMany({
    where: {
      isBooked: false,
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: "asc" },
    include: {
      user: { select: { fullName: true, email: true, phone: true, brokerage: true } },
    },
  });

  // Filter by slug match (normalize address to slug)
  const matchingSlots = allSlots.filter(s => {
    const addrSlug = s.propertyAddress.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return addrSlug === slug || addrSlug.includes(slug);
  });

  if (matchingSlots.length === 0) return null;

  const first = matchingSlots[0];
  return {
    propertyAddress: first.propertyAddress,
    unitNumber: first.unitNumber,
    agentName: first.user.fullName,
    agentBrokerage: first.user.brokerage,
    slots: matchingSlots.map(s => ({
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      duration: s.duration,
    })),
  };
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getShowingData(slug);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏠</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">No Available Slots</h1>
          <p className="text-sm text-slate-500">This showing link has no available time slots or has expired.</p>
        </div>
      </div>
    );
  }

  return <BookingView data={data} />;
}
