import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { canEnterShell } from './roles';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

export function ProtectedRoute() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading"
        className="flex min-h-screen items-center justify-center text-content-muted"
      >
        Loading…
      </div>
    );
  }

  if (status === 'guest' || !user) {
    return <Navigate to="/login" replace />;
  }

  // UX-only gate — the API enforces real authorization on every request.
  if (!canEnterShell(user.role)) {
    return <AccessDeniedPage />;
  }

  return <Outlet />;
}
