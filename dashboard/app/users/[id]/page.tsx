import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
import { View } from '@/components/view';
import { requireAuth } from '@/lib/auth';
import { query } from '@/lib/db';
import { parseRange } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const { range } = await searchParams;
  const [user] = await query<{ name: string; host: string | null; os: string | null; first_seen: string }>(
    'SELECT name, host, os, first_seen FROM users WHERE id = $1',
    [id],
  );
  if (!user) notFound();

  return (
    <Shell
      title={user.name}
      subtitle={`${user.host ?? 'unknown host'} · ${user.os ?? ''} · since ${new Date(user.first_seen).toISOString().slice(0, 10)}`}
      back={<Link href="/">← All users</Link>}
    >
      <View range={parseRange(range)} userId={id} />
    </Shell>
  );
}
