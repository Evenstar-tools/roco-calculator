const input = document.querySelector("#image-input");
const button = document.querySelector("#decode-button");
const status = document.querySelector("#status");
const dropZone = document.querySelector("#drop-zone");
const previewImage = document.querySelector("#preview-image");
const imageStage = document.querySelector("#image-stage");
const overlay = document.querySelector("#qr-overlay");
const resultPanel = document.querySelector("#result-panel");
const lineupPanel = document.querySelector("#lineup-panel");
let selectedFile = null;
let currentExport = null;

function setFile(file) {
  if (!file) return;
  selectedFile = file;
  button.disabled = false;
  status.textContent = `已选择：${file.name}`;
  status.dataset.tone = "ready";
  previewImage.src = URL.createObjectURL(file);
  previewImage.hidden = false;
  imageStage.querySelector("p").hidden = true;
  overlay.hidden = true;
  resultPanel.hidden = true;
  lineupPanel.hidden = true;
}

input.addEventListener("change", () => setFile(input.files[0]));
for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.dataset.dragging = "true";
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    delete dropZone.dataset.dragging;
  });
}
dropZone.addEventListener("drop", (event) => setFile(event.dataTransfer.files[0]));

function showLocation(result) {
  const points = result.corners.map(({ x, y }) => `${x},${y}`).join(" ");
  overlay.setAttribute("viewBox", `0 0 ${result.image.width} ${result.image.height}`);
  overlay.querySelector("polygon").setAttribute("points", points);
  overlay.hidden = false;
  document.querySelector("#image-meta").textContent = `${result.image.width} × ${result.image.height} · 识别到 ${result.codeCount} 个二维码`;
}

function renderLineup(preview) {
  currentExport = preview.export;
  document.querySelector("#team-name").textContent = preview.name;
  document.querySelector("#team-meta").textContent = `${preview.lineup.modeName} · ${preview.lineup.magicName} · ${preview.lineup.count} 个位置`;
  const grid = document.querySelector("#member-grid");
  grid.replaceChildren();
  preview.members.filter(Boolean).forEach((member) => {
    const article = document.createElement("article");
    article.innerHTML = `
      <div class="member-title"><span>${member.slot}</span><h3>${member.name}</h3></div>
      <p>${member.bloodline} · ${member.nature}${member.ivsPending ? " · 个体待确认" : ""}</p>
      <ul>${member.skills.map((skill) => `<li>${skill.name}</li>`).join("")}</ul>
    `;
    grid.append(article);
  });
  lineupPanel.hidden = false;
}

function showResult(result) {
  showLocation(result);
  document.querySelector("#classification-badge").textContent = result.classification.label;
  document.querySelector("#classification-note").textContent = result.classification.safeNote;
  document.querySelector("#raw-payload").textContent = result.payload;
  const protocolError = document.querySelector("#protocol-error");
  protocolError.hidden = !result.protocolError;
  protocolError.textContent = result.protocolError ? `协议校验未通过：${result.protocolError}` : "";
  resultPanel.hidden = false;
  lineupPanel.hidden = true;
  if (result.preview) renderLineup(result.preview);
}

button.addEventListener("click", async () => {
  if (!selectedFile) return;
  button.disabled = true;
  status.textContent = "正在本机定位和解码…";
  status.dataset.tone = "busy";
  const body = new FormData();
  body.append("image", selectedFile);
  try {
    const response = await fetch("/api/decode", { method: "POST", body });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "识别失败");
    showResult(result);
    status.textContent = result.preview ? "识别完成，可以导入" : "二维码已读出，载荷不能安全导入";
    status.dataset.tone = result.preview ? "success" : "warning";
  } catch (error) {
    status.textContent = error.message;
    status.dataset.tone = "error";
    resultPanel.hidden = true;
    lineupPanel.hidden = true;
    overlay.hidden = true;
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll("[data-copy]").forEach((copyButton) => {
  copyButton.addEventListener("click", async () => {
    const value = currentExport?.[copyButton.dataset.copy];
    if (!value) return;
    await navigator.clipboard.writeText(value);
    const original = copyButton.textContent;
    copyButton.textContent = "已复制";
    setTimeout(() => { copyButton.textContent = original; }, 1200);
  });
});
