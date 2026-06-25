import { useAuth } from '../auth/AuthContext';
import { DashboardPage } from './DashboardPage';
import { SellerDashboardPage } from './SellerDashboardPage';

/**
 * Role-branched index. A SELLER landing on "/" sees the seller dashboard
 * (which calls the seller-scoped API). Every other authenticated role sees the
 * admin DashboardPage. This avoids a 403 from the admin /products endpoint
 * that DashboardPage calls when a seller hits the shell root.
 */
export function IndexDashboard() {
  const { user } = useAuth();
  return user?.role === 'SELLER' ? <SellerDashboardPage /> : <DashboardPage />;
}
