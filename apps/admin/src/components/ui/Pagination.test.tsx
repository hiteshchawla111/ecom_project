import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('shows the "Showing X–Y of N" range for the first page', () => {
    render(
      <Pagination
        page={1}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText(/showing 1–20 of 45/i)).toBeInTheDocument();
  });

  it('shows the range for a middle page', () => {
    render(
      <Pagination
        page={2}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText(/showing 21–40 of 45/i)).toBeInTheDocument();
  });

  it('clamps the range end to the total on the last partial page', () => {
    render(
      <Pagination
        page={3}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText(/showing 41–45 of 45/i)).toBeInTheDocument();
  });

  it('shows "0–0 of 0" and no page buttons when empty', () => {
    render(
      <Pagination
        page={1}
        totalPages={1}
        total={0}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText(/showing 0–0 of 0/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Page 1' }),
    ).not.toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(
      <Pagination
        page={1}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();

    rerender(
      <Pagination
        page={3}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('calls onPageChange when a page number is clicked', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={1}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with neighbors when Prev/Next clicked', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={2}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={onPageChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('renders ellipsis and both endpoints for many pages', () => {
    render(
      <Pagination
        page={10}
        totalPages={20}
        total={400}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    expect(screen.getAllByText('…').length).toBeGreaterThanOrEqual(1);
  });

  it('marks the current page with aria-current', () => {
    render(
      <Pagination
        page={2}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    const current = screen.getByRole('button', { name: 'Page 2' });
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('exposes a labelled pagination navigation landmark', () => {
    render(
      <Pagination
        page={1}
        totalPages={3}
        total={45}
        pageSize={20}
        onPageChange={() => {}}
      />,
    );
    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(
      within(nav).getByRole('button', { name: 'Page 2' }),
    ).toBeInTheDocument();
  });
});
