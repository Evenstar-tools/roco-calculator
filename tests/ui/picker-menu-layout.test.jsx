import { expect, test, vi, afterEach } from "vitest";
import { fitPickerMenu, getPickerBounds } from "../../src/components/picker-menu-layout.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });
test("aligns the whole control and flips inside a clipped team editor", () => {
  const layout = fitPickerMenu({left:39,top:572,bottom:616,width:175}, {left:8,right:385,top:359,bottom:844}, 360,320);
  expect(layout).toEqual({left:39,width:320,placement:"down",maxHeight:216});
  expect(fitPickerMenu({left:34,top:168,bottom:202,width:310}, {left:0,right:378,top:0,bottom:300},224)).toEqual({left:34,width:310,placement:"up",maxHeight:156});
});
test("intersects scroll containers, borders and a panned visual viewport", () => {
  document.body.innerHTML = '<div style="overflow-x:hidden;overflow-y:auto"><div id="anchor"></div></div>';
  const anchor = document.getElementById("anchor");
  const parent = anchor.parentElement;
  vi.stubGlobal("visualViewport", {offsetLeft:20,offsetTop:100,width:320,height:500});
  vi.spyOn(parent,"getBoundingClientRect").mockReturnValue({left:8,top:359,right:385,bottom:844});
  Object.defineProperties(parent,{clientLeft:{value:1},clientTop:{value:1},clientWidth:{value:375},clientHeight:{value:483}});
  expect(getPickerBounds(anchor)).toEqual({left:20,right:340,top:360,bottom:600,clipped:true});
});

test("reserves visible app bars without leaking them into dialogs", () => {
  document.body.innerHTML = '<header class="app-header"></header><footer class="mobile-result-bar"></footer><div id="anchor"></div>';
  vi.stubGlobal("visualViewport", {offsetLeft:0,offsetTop:0,width:393,height:852});
  vi.spyOn(document.querySelector("header"),"getBoundingClientRect").mockReturnValue({top:0,bottom:54,height:54});
  vi.spyOn(document.querySelector("footer"),"getBoundingClientRect").mockReturnValue({top:780,bottom:852,height:72});
  const anchor=document.getElementById("anchor");
  expect(getPickerBounds(anchor)).toMatchObject({top:54,bottom:780});
  anchor.setAttribute("role","dialog");
  expect(getPickerBounds(anchor)).toMatchObject({top:0,bottom:852});
});
