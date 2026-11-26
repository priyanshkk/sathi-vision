const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const placeholder = document.getElementById("placeholder");
const errorBox = document.getElementById("errorBox");
const statusText = document.getElementById("statusText");
const modeValue = document.getElementById("modeValue");
const objectCount = document.getElementById("objectCount");
const fpsValue = document.getElementById("fpsValue");
const latencyValue = document.getElementById("latencyValue");
const labelChips = document.getElementById("labelChips");
const labelInput = document.getElementById("labelInput");
const thresholdInput = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
const startBtn = document.getElementById("startCamera");
const stopBtn = document.getElementById("stopCamera");
const snapshotBtn = document.getElementById("snapshotBtn");

const COLORS = ["#39ff14", "#22d3ee", "#a371f7", "#ffa657", "#ff6b6b", "#f0f6fc"];

let labels = [];
let threshold = Number(thresholdInput.value);
let stream = null;
let busy = false;
let lastSent = 0;
let running = false;
let detections = [];
let recentFrames = [];
let backendMode = "…";

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function renderLabels() {
  labelChips.replaceChildren();
  labels.forEach((label, index) => {
    const chip = document.createElement("span");
    chip.className = "label-chip";
    chip.append(document.createTextNode(label));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = `Remove ${label}`;
    remove.addEventListener("click", () => {
      labels.splice(index, 1);
      renderLabels();
    });

    chip.append(remove);
    labelChips.append(chip);
  });
  document.getElementById("heroLabels").textContent = `${labels.length}+`;
}

function drawBoxes(context, width, height, items) {
  context.clearRect(0, 0, width, height);
  const lineWidth = Math.max(2, Math.round(width / 420));
  const font = `700 ${Math.max(12, Math.round(width / 72))}px ui-monospace, SFMono-Regular, Menlo, monospace`;

  items.forEach((item, index) => {
    const [x1, y1, x2, y2] = item.box || [];
    if ([x1, y1, x2, y2].some((value) => !Number.isFinite(value))) return;

    const color = COLORS[index % COLORS.length];
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const text = `${item.label} ${Math.round((item.score || 0) * 100)}%`;
    context.font = font;
    const textWidth = context.measureText(text).width;
    const boxHeight = Math.max(18, Math.round(width / 48));
    const top = Math.max(0, y1 - boxHeight);

    context.fillStyle = color;
    context.fillRect(x1, top, textWidth + 10, boxHeight);
    context.fillStyle = "#06100a";
    context.fillText(text, x1 + 5, top + boxHeight - 5);
  });
}

function paintOverlay() {
  if (!video.videoWidth) return;
  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
  }
  drawBoxes(overlay.getContext("2d"), overlay.width, overlay.height, detections);
}

function updateStats(result) {
  objectCount.textContent = String(result.count ?? detections.length);
  latencyValue.textContent = String(result.latency_ms ?? 0);
  backendMode = result.mode || backendMode;
  modeValue.textContent = `mode: ${backendMode}`;

  const now = performance.now();
  recentFrames.push(now);
  recentFrames = recentFrames.filter((time) => now - time < 3000);
  if (recentFrames.length > 1) {
    const interval = (now - recentFrames[0]) / (recentFrames.length - 1);
    fpsValue.textContent = String(Math.max(1, Math.round(1000 / interval)));
  }
}

async function sendFrame() {
  if (!stream || busy || !video.videoWidth) return;
  busy = true;

  try {
    const capture = document.createElement("canvas");
    const scale = Math.min(1, 960 / video.videoWidth);
    capture.width = Math.round(video.videoWidth * scale);
    capture.height = Math.round(video.videoHeight * scale);
    capture.getContext("2d").drawImage(video, 0, 0, capture.width, capture.height);
    const image = capture.toDataURL("image/jpeg", 0.66);

    const response = await fetch("/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, labels, threshold }),
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.detail || `Backend error ${response.status}`);
    }

    const result = await response.json();
    detections = result.detections || [];
    paintOverlay();
    updateStats(result);
    clearError();
  } catch (error) {
    showError(`Detection error: ${error.message}`);
  } finally {
    busy = false;
  }
}

function loop() {
  if (!running) return;
  const now = performance.now();
  if (now - lastSent > 130) {
    lastSent = now;
    sendFrame();
  }
  requestAnimationFrame(loop);
}

async function startCamera() {
  clearError();
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Ye browser camera support nahi karta. Chrome/Edge use karein ya HTTPS par open karein.");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();
    running = true;
    recentFrames = [];
    placeholder.hidden = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    snapshotBtn.disabled = false;
    statusText.textContent = "Camera live · detecting";
    loop();
  } catch (error) {
    const message = error.name === "NotAllowedError"
      ? "Camera permission deny ho gayi. Browser address bar se camera access allow karo."
      : error.name === "NotFoundError"
        ? "Koi camera device nahi mila."
        : error.message;
    showError(message);
    statusText.textContent = "Camera unavailable";
  }
}

function stopCamera() {
  running = false;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  detections = [];
  overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
  placeholder.hidden = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  snapshotBtn.disabled = true;
  statusText.textContent = backendMode ? `Backend ready · ${backendMode}` : "Camera off";
}

function snapshot() {
  if (!video.videoWidth) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0);
  drawBoxes(context, canvas.width, canvas.height, detections);

  const link = document.createElement("a");
  link.download = `sathi-vision-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
snapshotBtn.addEventListener("click", snapshot);

document.getElementById("labelForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = labelInput.value.trim().toLowerCase();
  if (!value) return;
  if (!labels.includes(value)) labels.push(value);
  labelInput.value = "";
  renderLabels();
});

thresholdInput.addEventListener("input", () => {
  threshold = Number(thresholdInput.value);
  thresholdValue.textContent = threshold.toFixed(2);
});

async function loadHealth() {
  try {
    const response = await fetch("/health");
    const data = await response.json();
    const detector = data.detector || {};
    backendMode = detector.mode || "unknown";
    modeValue.textContent = `mode: ${backendMode}`;
    statusText.textContent = detector.ready
      ? `Backend ready · ${backendMode}`
      : `${backendMode} · first frame par model load hoga`;
    if (detector.label_count) document.getElementById("heroLabels").textContent = `${detector.label_count}+`;
  } catch {
    statusText.textContent = "Backend offline";
    showError("Python backend se connection nahi hua. `uvicorn app:app` chalao.");
  }
}

async function loadLabels() {
  try {
    const response = await fetch("/labels");
    const data = await response.json();
    labels = data.labels || [];
  } catch {
    labels = ["pen", "dog", "cup", "phone", "book", "person"];
  }
  renderLabels();
}

await Promise.all([loadHealth(), loadLabels()]);
