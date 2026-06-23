import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // logout() is best-effort and never throws (see AuthContext), so navigate always runs.
  async function onClick() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      Sign out
    </button>
  );
}
