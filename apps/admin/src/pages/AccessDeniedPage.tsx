import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AccessDeniedPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function onSignOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-heading text-2xl font-semibold text-content">Access denied</h1>
      <p className="max-w-md text-content-muted">
        Your account doesn't have permission to use the admin panel.
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="rounded-md bg-primary-500 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
      >
        Sign out
      </button>
    </main>
  );
}
