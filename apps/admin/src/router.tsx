import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminOnlyRoute } from './auth/AdminOnlyRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductNewPage } from './pages/ProductNewPage';
import { ProductEditPage } from './pages/ProductEditPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          {
            element: <AdminOnlyRoute />,
            children: [
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/new', element: <ProductNewPage /> },
              { path: 'products/:id/edit', element: <ProductEditPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
