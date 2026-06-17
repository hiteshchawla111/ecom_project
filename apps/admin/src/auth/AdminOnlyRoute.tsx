import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

/**
 * Restricts a route subtree to ADMIN. Nest inside ProtectedRoute (which already
 * gates guests / non-internal roles); this adds the ADMIN-only check so an
 * INVENTORY_MANAGER reaching the shell can't open product management.
 *
 * UX-only — the API enforces @Roles(ADMIN) on every mutating request.
 */
export function AdminOnlyRoute() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') return <AccessDeniedPage />;
  return <Outlet />;
}
