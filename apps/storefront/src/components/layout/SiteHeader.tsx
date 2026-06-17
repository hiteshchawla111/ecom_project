import { getCurrentUser } from '@/lib/session';
import { SiteHeaderView } from './SiteHeaderView';

/**
 * Server wrapper: resolves the current session, then renders the presentational
 * header. Kept thin so all markup/logic lives in (and is tested via)
 * {@link SiteHeaderView}.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();
  return <SiteHeaderView user={user} />;
}
