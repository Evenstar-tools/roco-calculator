export default defineAppConfig({
  pages: ["pages/index/index"],
  darkmode: true,
  themeLocation: "theme.json",
  window: {
    navigationBarTitleText: "洛克计算器 · S4「季中」",
    navigationBarBackgroundColor: "@navigationBackground",
    navigationBarTextStyle: "white",
    backgroundColor: "@pageBackground",
    backgroundTextStyle: "@backgroundTextStyle"
  }
});
