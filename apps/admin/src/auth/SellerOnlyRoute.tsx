import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

/**
 * Restricts a route subtree to SELLER. Nest inside ProtectedRoute (which admits
 * any shell role); this blocks ADMIN / INVENTORY_MANAGER from the seller portal.
 *
 * UX-only — the API enforces seller scoping + SellerApprovedGuard on every request.
 */
export function SellerOnlyRoute() {
  const { user } = useAuth();
  if (user?.role !== 'SELLER') return <AccessDeniedPage />;
  return <Outlet />;
}
