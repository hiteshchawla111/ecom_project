import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SellerProductImportPage } from './SellerProductImportPage';

const importSellerProducts = vi.fn();
vi.mock('../lib/sellerProducts', () => ({
  importSellerProducts: (f: File) => importSellerProducts(f),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SellerProductImportPage />
    </MemoryRouter>,
  );
}

const pickFile = () => {
  const input = screen.getByLabelText(/csv file/i) as HTMLInputElement;
  const file = new File(['name,sku\nX,X1'], 'p.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
};

describe('SellerProductImportPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads the chosen file and shows the result summary', async () => {
    importSellerProducts.mockResolvedValue({
      created: 2, failed: 1, productIds: ['a', 'b'],
      errors: [{ row: 3, sku: 'BAD', message: 'name must be longer' }],
    });
    renderPage();
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));

    await waitFor(() => expect(importSellerProducts).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/2 created/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
    // error row surfaced
    expect(screen.getByText(/name must be longer/i)).toBeInTheDocument();
    expect(screen.getByText('BAD')).toBeInTheDocument();
  });

  it('disables upload until a file is chosen', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled();
  });

  it('shows an error banner when the upload request fails', async () => {
    importSellerProducts.mockRejectedValue(new Error('Request failed (400)'));
    renderPage();
    pickFile();
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
