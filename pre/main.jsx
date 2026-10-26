import { installPreviewStorage } from "../src/runtime/preview-storage.js";

function showError() {
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = "抢先体验加载失败，请刷新或返回正式版。";
  const link = document.createElement("a");
  link.href = "/cn/";
  link.textContent = "返回正式版";
  document.getElementById("root").replaceChildren(message, link);
}

try {
  installPreviewStorage();
  void import("../src/main.jsx").catch(showError);
} catch {
  showError();
}
