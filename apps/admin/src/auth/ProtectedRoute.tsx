import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { isInternalRole } from './roles';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

export function ProtectedRoute() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center text-neutral-600"
      >
        Loading…
      </div>
    );
  }

  if (status === 'guest' || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!isInternalRole(user.role)) {
    return <AccessDeniedPage />;
  }

  return <Outlet />;
}
