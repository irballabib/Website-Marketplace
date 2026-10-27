import { notFound, redirect } from 'next/navigation';

import { resolveQr } from '../../../lib/api';

export const dynamic = 'force-dynamic';

interface QrPageProps {
  params: Promise<{ code: string }>;
}

export default async function QrPage({ params }: QrPageProps) {
  const { code } = await params;
  const qr = await resolveQr(code);

  if (!qr) {
    notFound();
  }

  redirect(qr.targetUrl);
}
