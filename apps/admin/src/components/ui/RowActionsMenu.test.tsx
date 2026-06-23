import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowActionsMenu } from './RowActionsMenu';

describe('RowActionsMenu', () => {
  it('hides the menu items until the trigger is clicked', () => {
    render(
      <RowActionsMenu label="Actions for Aurora Phone">
        <button type="button">Edit</button>
        <button type="button">Archive</button>
      </RowActionsMenu>,
    );
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /actions for aurora phone/i }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals the items when the trigger is clicked', async () => {
    render(
      <RowActionsMenu label="Actions">
        <button type="button">Edit</button>
        <button type="button">Archive</button>
      </RowActionsMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('closes the menu when Escape is pressed', async () => {
    render(
      <RowActionsMenu label="Actions">
        <button type="button">Edit</button>
      </RowActionsMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText('Edit')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('closes the menu after an item is activated', async () => {
    const onEdit = vi.fn();
    render(
      <RowActionsMenu label="Actions">
        <button type="button" onClick={onEdit}>
          Edit
        </button>
      </RowActionsMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalled();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });
});
