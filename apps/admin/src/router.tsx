import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminOnlyRoute } from './auth/AdminOnlyRoute';
import { SellerOnlyRoute } from './auth/SellerOnlyRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { IndexDashboard } from './pages/IndexDashboard';
import { ProductsPage } from './pages/ProductsPage';
import { ProductNewPage } from './pages/ProductNewPage';
import { ProductEditPage } from './pages/ProductEditPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { InventoryPage } from './pages/InventoryPage';
import { InventoryItemPage } from './pages/InventoryItemPage';
import { SellersPage } from './pages/SellersPage';
import { SellerDetailPage } from './pages/SellerDetailPage';
import { SellerComingSoon } from './pages/SellerComingSoon';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <IndexDashboard /> },
          // Inventory is open to both internal roles (ADMIN + INVENTORY_MANAGER),
          // so it sits directly under the shell, not the ADMIN-only group.
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'inventory/:productId', element: <InventoryItemPage /> },
          {
            element: <AdminOnlyRoute />,
            children: [
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/new', element: <ProductNewPage /> },
              { path: 'products/:id/edit', element: <ProductEditPage /> },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'orders/:id', element: <OrderDetailPage /> },
              { path: 'sellers', element: <SellersPage /> },
              { path: 'sellers/:id', element: <SellerDetailPage /> },
            ],
          },
          {
            element: <SellerOnlyRoute />,
            children: [
              { path: 'seller/products', element: <SellerComingSoon area="Products" /> },
              { path: 'seller/inventory', element: <SellerComingSoon area="Inventory" /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
