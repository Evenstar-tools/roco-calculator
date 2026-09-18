import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SkillPicker, resolveSkillMenuLayout } from '../../src/components/SkillPicker.jsx';
const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
afterEach(() => { if (original) Object.defineProperty(window, 'visualViewport', original); else delete window.visualViewport; vi.restoreAllMocks(); });
const skills = Array.from({length: 50}, (_, i) => ({id: 'dialog-'+i, name: '测试技能'+i, category: 'physical', basePower: 80, cost: 2}));
const rect = (left, top, width, height) => ({left,top,width,height,right:left+width,bottom:top+height});
test('viewport offset limits the menu to the visible region', () => {
  expect(resolveSkillMenuLayout({inputTop:300,inputBottom:342,viewportTop:240,viewportHeight:250})).toEqual({placement:'down',maxHeight:136});
});
test('half-width slot gets a bounded readable menu and follows visual viewport changes', async () => {
  const viewport = Object.assign(new EventTarget(), {offsetTop:0,offsetLeft:0,height:844,width:390});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  const boundary = {current:{getBoundingClientRect:()=>rect(8,100,374,650)}};
  render(<SkillPicker readable menuBoundaryRef={boundary} ariaLabel="传动技能" onSelect={vi.fn()} selected={skills[0]} skills={skills}/>);
  const input = screen.getByRole('combobox');
  vi.spyOn(input,'getBoundingClientRect').mockReturnValue(rect(202,450,165,42));
  vi.spyOn(input.parentElement,'getBoundingClientRect').mockReturnValue(rect(202,450,165,42));
  fireEvent.focus(input);
  const list = screen.getByRole('listbox');
  expect(list).toHaveStyle({width:'320px',left:'-148px',maxHeight:'338px'});
  viewport.offsetTop=240; viewport.height=270; viewport.dispatchEvent(new Event('resize'));
  await waitFor(()=>expect(list).toHaveStyle({maxHeight:'198px'}));
  for(let i=0;i<9;i++) fireEvent.keyDown(input,{key:'ArrowDown'});
  const active=document.getElementById(input.getAttribute('aria-activedescendant'));
  expect(active).toBeInTheDocument();
  expect(Number(active.getAttribute('aria-posinset'))*72).toBeLessThanOrEqual(list.scrollTop+198);
});
test('escape closes suggestions before the surrounding dialog', () => {
  const outer=vi.fn();const select=vi.fn();
  render(<div onKeyDown={outer}><SkillPicker readable ariaLabel="传动技能" onSelect={select} selected={skills[0]} skills={skills}/></div>);
  const input=screen.getByRole('combobox');fireEvent.focus(input);fireEvent.keyDown(input,{key:'Escape'});
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();expect(outer).not.toHaveBeenCalled();expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(input,{key:'Escape'});expect(outer).toHaveBeenCalledTimes(1);
});
