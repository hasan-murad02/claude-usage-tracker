import { Shell } from '@/components/shell';
import { View } from '@/components/view';
import { requireAuth } from '@/lib/auth';
import { parseRange } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAuth();
  const { range } = await searchParams;
  return (
    <Shell title="Claude Code usage">
      <View range={parseRange(range)} />
    </Shell>
  );
}
