import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Pagination } from './Pagination';

const hrefForPage = (p: number) => `/products?page=${p}`;

describe('Pagination', () => {
  it('renders nothing when there is one page or fewer', () => {
    const { container } = render(
      <Pagination
        page={1}
        totalPages={1}
        total={5}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('builds page-number links via hrefForPage', () => {
    render(
      <Pagination
        page={1}
        totalPages={3}
        total={30}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute(
      'href',
      '/products?page=2',
    );
    expect(screen.getByRole('link', { name: 'Page 3' })).toHaveAttribute(
      'href',
      '/products?page=3',
    );
  });

  it('marks the current page with aria-current and not as a link', () => {
    render(
      <Pagination
        page={2}
        totalPages={3}
        total={30}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    // The current page is not a link.
    expect(screen.queryByRole('link', { name: 'Page 2' })).not.toBeInTheDocument();
    const current = screen.getByText('2', { selector: '[aria-current="page"]' });
    expect(current).toBeInTheDocument();
  });

  it('shows ellipsis and both endpoints for many pages', () => {
    render(
      <Pagination
        page={5}
        totalPages={20}
        total={240}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    // Endpoints always present.
    expect(screen.getByRole('link', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Page 20' })).toBeInTheDocument();
    // Neighbors of the current page.
    expect(screen.getByRole('link', { name: 'Page 4' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Page 6' })).toBeInTheDocument();
    // At least one ellipsis.
    expect(screen.getAllByText('…').length).toBeGreaterThanOrEqual(1);
  });

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(
      <Pagination
        page={1}
        totalPages={3}
        total={30}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    let prev = screen.getByLabelText('Previous page');
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Next page')).not.toHaveAttribute(
      'aria-disabled',
    );

    rerender(
      <Pagination
        page={3}
        totalPages={3}
        total={30}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    expect(screen.getByLabelText('Next page')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    prev = screen.getByLabelText('Previous page');
    expect(prev).not.toHaveAttribute('aria-disabled');
  });

  it('shows the "Showing X–Y of N" range for a middle page', () => {
    render(
      <Pagination
        page={2}
        totalPages={4}
        total={45}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    expect(screen.getByText(/showing 13–24 of 45/i)).toBeInTheDocument();
  });

  it('clamps the range end to the total on the last (partial) page', () => {
    render(
      <Pagination
        page={4}
        totalPages={4}
        total={45}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    expect(screen.getByText(/showing 37–45 of 45/i)).toBeInTheDocument();
  });

  it('exposes a labelled pagination navigation landmark', () => {
    render(
      <Pagination
        page={1}
        totalPages={3}
        total={30}
        pageSize={12}
        hrefForPage={hrefForPage}
      />,
    );
    const nav = screen.getByRole('navigation', { name: /pagination/i });
    expect(within(nav).getByRole('link', { name: 'Page 2' })).toBeInTheDocument();
  });
});
