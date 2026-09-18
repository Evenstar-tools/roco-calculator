import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { SkillPicker } from '../../src/components/SkillPicker.jsx';

const skills = Array.from({ length: 80 }, (_, i) => ({
  id: `scroll-${i}`, name: `滚动技能${i}`, type: '火', category: 'physical', basePower: 80, cost: 2,
}));
function setup() {
  const onSelect = vi.fn();
  render(<><SkillPicker ariaLabel="拖动验收" selected={skills[0]} skills={skills} onSelect={onSelect} /><button>外部控件</button></>);
  const input = screen.getByRole('combobox');
  act(() => input.focus());
  return { input, onSelect, list: screen.getByRole('listbox') };
}

test('native scrollbar may focus the list without closing it or cancelling mouse down', () => {
  const { input, list, onSelect } = setup();
  expect(list).toHaveAttribute('tabindex', '-1');
  act(() => list.focus());
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(fireEvent.mouseDown(list, { button: 0, cancelable: true })).toBe(true);
  list.scrollTop = 1260;
  fireEvent.scroll(list);
  fireEvent.mouseUp(list);
  expect(screen.getByRole('listbox')).toBe(list);
  expect(list.scrollTop).toBeGreaterThan(1000);
  expect(onSelect).not.toHaveBeenCalled();
});

test('keyboard selection still works after a scrollbar focused the list and returns input focus', () => {
  const { input, list, onSelect } = setup();
  act(() => list.focus());
  list.scrollTop = 420;
  fireEvent.scroll(list);
  fireEvent.keyDown(list, { key: 'ArrowDown' });
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(input).toHaveFocus();
});

test('moving focus outside still closes suggestions', () => {
  const { list } = setup();
  act(() => list.focus());
  act(() => screen.getByRole('button', { name: '外部控件' }).focus());
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('a mouse-selected option after scrollbar focus commits exactly once', () => {
  const { input, list, onSelect } = setup();
  act(() => list.focus());
  const option = screen.getByRole('option', { name: /滚动技能2 物理/ });
  fireEvent.mouseDown(option);
  fireEvent.click(option);
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('scroll-2');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(input).toHaveFocus();
});
