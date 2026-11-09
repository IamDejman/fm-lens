import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DateInput } from '../src/DateInput';
import { dateLayout, dateText, isoFromDateText, typedDateText, type DateLayout } from '../src/dateEntry';

// jsdom has no calendar: say there is one, so that the button that opens it is drawn.
vi.hoisted(() => {
  HTMLInputElement.prototype.showPicker = () => {};
});

const dayFirst: DateLayout = { order: ['day', 'month', 'year'], separator: '/' };
const monthFirst: DateLayout = { order: ['month', 'day', 'year'], separator: '/' };

/** What the input shows after `keys` are typed one by one at its end. */
const typed = (keys: string, layout = dayFirst) => [...keys].reduce((text, key) => typedDateText(text + key, layout), '');

test('a language gives the order of a date and the mark between its parts', () => {
  expect(dateLayout('en-GB')).toEqual(dayFirst);
  expect(dateLayout('es-ES')).toEqual(dayFirst);
  expect(dateLayout('tr-TR')).toEqual({ order: ['day', 'month', 'year'], separator: '.' });
  expect(dateLayout('en-US')).toEqual(monthFirst);
  expect(dateText('2028-07-20', dayFirst)).toBe('20/07/2028');
  expect(dateText('2028-07-20', monthFirst)).toBe('07/20/2028');
  expect(dateText('20/0', dayFirst)).toBe('20/0');
});

test('digits typed in one go fill the day, the month and the year in turn', () => {
  expect(typed('20072028')).toBe('20/07/2028');
  expect(typed('2')).toBe('2');
  expect(typed('20')).toBe('20/');
  expect(typed('200')).toBe('20/0');
  expect(typed('472028')).toBe('04/07/2028');
  expect(typed('2/7/2028')).toBe('02/07/2028');
  expect(typed('20.07.2028')).toBe('20/07/2028');
  expect(typed('07202028', monthFirst)).toBe('07/20/2028');
  expect(typed('200720281')).toBe('20/07/2028');
});

test('a typed date is read once it is a whole, real one', () => {
  expect(isoFromDateText('20/07/2028', dayFirst)).toBe('2028-07-20');
  expect(isoFromDateText('20072028', dayFirst)).toBe('2028-07-20');
  expect(isoFromDateText('20.07.2028', dayFirst)).toBe('2028-07-20');
  expect(isoFromDateText(' 20-07-2028 ', dayFirst)).toBe('2028-07-20');
  expect(isoFromDateText('2028-07-20', dayFirst)).toBe('2028-07-20');
  expect(isoFromDateText('2/7/2028', dayFirst)).toBe('2028-07-02');
  expect(isoFromDateText('07/20/2028', monthFirst)).toBe('2028-07-20');
  expect(isoFromDateText('29/02/2028', dayFirst)).toBe('2028-02-29');
  for (const text of ['', '20/07', '20/07/28', '31/02/2028', '29/02/2027', '00/07/2028', '20/13/2028', '20/07/2028x']) {
    expect(isoFromDateText(text, dayFirst)).toBeNull();
  }
});

function Field({ start, onValue }: { start: string; onValue: (value: string) => void }) {
  const [value, setValue] = useState(start);
  return <>
    <DateInput aria-label="Joins" value={value} onChange={next => { setValue(next); onValue(next); }} />
    <button onClick={() => setValue('2029-01-02')}>Reset</button>
  </>;
}

test('typing over a date gives the date typed, not the 28th of the old month', async () => {
  const user = userEvent.setup();
  const onValue = vi.fn();
  render(<Field start="2027-12-08" onValue={onValue} />);
  const input = screen.getByLabelText<HTMLInputElement>('Joins');
  expect(input.value).toBe('08/12/2027');
  // The click that enters the field selects the date.
  await user.click(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 10]);
  await user.keyboard('20072028');
  expect(input.value).toBe('20/07/2028');
  expect(onValue).toHaveBeenLastCalledWith('2028-07-20');
  // Without selecting it first: a digit after a whole date starts the next one.
  await user.click(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([10, 10]);
  await user.keyboard('31122029');
  expect(input.value).toBe('31/12/2029');
  expect(onValue).toHaveBeenLastCalledWith('2029-12-31');
});

test('a part can be deleted and typed again, a short date is filled out on leaving, and a reset shows', async () => {
  const user = userEvent.setup();
  const onValue = vi.fn();
  render(<Field start="" onValue={onValue} />);
  const input = screen.getByLabelText<HTMLInputElement>('Joins');
  expect(input.placeholder).toBe('dd/mm/yyyy');
  await user.type(input, '2007');
  expect(input.value).toBe('20/07/');
  expect(onValue).toHaveBeenLastCalledWith('20/07/');
  await user.keyboard('{Backspace}{Backspace}{Backspace}');
  expect(input.value).toBe('20/');
  await user.keyboard('82028');
  expect(input.value).toBe('20/08/2028');
  expect(onValue).toHaveBeenLastCalledWith('2028-08-20');
  await user.clear(input);
  expect(onValue).toHaveBeenLastCalledWith('');
  await user.click(input);
  await user.paste('2028-07-02');
  expect(onValue).toHaveBeenLastCalledWith('2028-07-02');
  expect(input.value).toBe('02/07/2028');
  await user.clear(input);
  await user.type(input, '3/7/2028');
  await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{Backspace}');
  expect(input.value).toBe('03/0/2028');
  await user.keyboard('9');
  expect(input.value).toBe('03/09/2028');
  expect(onValue).toHaveBeenLastCalledWith('2028-09-03');
  await user.click(screen.getByRole('button', { name: 'Reset' }));
  expect(input.value).toBe('02/01/2029');
});

test('the open calendar holds focus so that it closes on leaving, and a date typed there goes to the field', async () => {
  const user = userEvent.setup();
  const onValue = vi.fn();
  const { container } = render(<Field start="2027-12-08" onValue={onValue} />);
  const input = screen.getByLabelText<HTMLInputElement>('Joins');
  const picker = container.querySelector<HTMLInputElement>('.date-picker');
  await user.click(screen.getByRole('button', { name: 'Calendar' }));
  expect(document.activeElement).toBe(picker);
  await user.keyboard('2');
  expect(document.activeElement).toBe(input);
  await user.keyboard('0072028');
  expect(input.value).toBe('20/07/2028');
  expect(onValue).toHaveBeenLastCalledWith('2028-07-20');
});
