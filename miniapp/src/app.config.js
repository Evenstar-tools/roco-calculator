export default defineAppConfig({
  pages: ["pages/index/index"],
  darkmode: true,
  themeLocation: "theme.json",
  window: {
    navigationBarTitleText: "洛克计算器 · S4「月涌狂想」",
    navigationBarBackgroundColor: "@navigationBackground",
    navigationBarTextStyle: "white",
    backgroundColor: "@pageBackground",
    backgroundTextStyle: "@backgroundTextStyle"
  }
});
