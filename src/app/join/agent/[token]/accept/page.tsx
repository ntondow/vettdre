import AcceptInviteClient from "./accept-client";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptInviteClient token={token} />;
}
