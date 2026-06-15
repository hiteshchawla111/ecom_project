import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from './page';

describe('Home page', () => {
  it('renders the getting-started heading', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: /to get started, edit the page\.tsx file/i }),
    ).toBeInTheDocument();
  });
});
