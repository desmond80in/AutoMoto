import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from '../src/components/Drawer';
import { PinInput } from '../src/components/PinInput';
import { PlateChip } from '../src/components/PlateChip';
import { TotalsBox } from '../src/components/TotalsBox';
import { computeTotals } from '../src/lib/totals';

describe('PlateChip', () => {
  it('formats 4 letters + 3 digits with a space and labels it', () => {
    render(<PlateChip plate="CAAB214" />);
    expect(screen.getByRole('img', { name: 'Licence plate CAAB 214' })).toBeInTheDocument();
    expect(screen.getByText('CAAB 214')).toBeInTheDocument();
    expect(screen.getByText('ONTARIO')).toBeInTheDocument();
  });
  it('keeps other plates as stored, sizes as classes', () => {
    const { container } = render(<PlateChip plate="AB12" size="lg" />);
    expect(screen.getByText('AB12')).toBeInTheDocument();
    expect(container.querySelector('.plate.lg')).not.toBeNull();
  });
});

describe('TotalsBox', () => {
  it('shows parts, labour, HST 13% and total', () => {
    const t = computeTotals([{ type: 'part', qty: 2, unit_price: 50 }, { type: 'labour', qty: 1.5, unit_price: 140 }], [], 0.13);
    render(<TotalsBox totals={t} hstRate={0.13} />);
    expect(screen.getByTestId('t-parts')).toHaveTextContent('$100.00');
    expect(screen.getByTestId('t-labour')).toHaveTextContent('$210.00');
    expect(screen.getByText('HST 13%')).toBeInTheDocument();
    expect(screen.getByTestId('t-tax')).toHaveTextContent('$40.30');
    expect(screen.getByTestId('t-total')).toHaveTextContent('$350.30');
  });
});

describe('Drawer unsaved changes', () => {
  it('closes straight away when clean', () => {
    const onClose = vi.fn();
    render(<Drawer crumb="Job" onClose={onClose}>body</Drawer>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('asks before discarding, and Keep editing keeps it open', () => {
    const onClose = vi.fn();
    render(<Drawer crumb="Job" dirty onClose={onClose}>body</Drawer>);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('You have unsaved changes.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('Escape also honours unsaved changes', () => {
    const onClose = vi.fn();
    render(<Drawer crumb="Job" dirty onClose={onClose}>body</Drawer>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('PinInput', () => {
  const slots = (c: HTMLElement) => [...c.querySelectorAll('.pin-slot')].map((e) => e.className.replace('pin-slot', '').trim());
  it('shows one filled slot per digit typed, the next slot marked, 5th and 6th optional', () => {
    const { container } = render(
      <>
        <label htmlFor="p">PIN</label>
        <PinInput id="p" value="43" onChange={() => {}} />
      </>,
    );
    expect(slots(container)).toEqual(['filled', 'filled', 'next', '', 'opt', 'opt']);
    expect(screen.getByLabelText('PIN')).toHaveAttribute('type', 'password');
  });
  it('keeps digits only, at most 6', () => {
    const onChange = vi.fn();
    render(<PinInput id="p" value="" onChange={onChange} />);
    fireEvent.change(document.getElementById('p')!, { target: { value: '12a3456789' } });
    expect(onChange).toHaveBeenCalledWith('123456');
  });
});
