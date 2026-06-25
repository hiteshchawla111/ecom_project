import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { router } from './router';
import { getBranding, applyBrandHue } from './lib/branding';

// Apply the admin-configured brand hue as early as possible. The SPA can't SSR
// it like the storefront, so there may be a brief default-coral flash before
// this resolves; failure leaves the default in place.
void getBranding()
  .then(({ hue }) => applyBrandHue(hue))
  .catch(() => {
    /* keep the default coral hue */
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
