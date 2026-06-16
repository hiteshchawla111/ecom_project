import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <section>
      <h2 className="font-heading text-2xl font-semibold text-neutral-900">Dashboard</h2>
      <p className="mt-2 text-neutral-600">Welcome, {user?.email}.</p>
    </section>
  );
}
