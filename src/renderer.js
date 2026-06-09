const urlInput = document.querySelector("#url");
const previewButton = document.querySelector("#preview");
const addButton = document.querySelector("#add");
const stopButton = document.querySelector("#stop-queue");
const resumeButton = document.querySelector("#resume-queue");
const openFolderButton = document.querySelector("#open-folder");
const clearHistoryButton = document.querySelector("#clear-history");
const downloadDir = document.querySelector("#download-dir");
const qualitySelect = document.querySelector("#quality");
const qualityOptions = document.querySelector("#quality-options");
const previewCard = document.querySelector("#preview-card");
const previewThumb = document.querySelector("#preview-thumb");
const previewTitle = document.querySelector("#preview-title");
const previewMeta = document.querySelector("#preview-meta");
const queueList = document.querySelector("#queue-list");
const queueEmpty = document.querySelector("#queue-empty");
const historyList = document.querySelector("#history-list");
const historyEmpty = document.querySelector("#history-empty");
const toast = document.querySelector("#toast");
const queuedCount = document.querySelector("#queued-count");
const runningCount = document.querySelector("#running-count");
const completeCount = document.querySelector("#complete-count");

let lastPreview = null;
let queueState = { jobs: [], activeJobId: null, paused: false };

function selectedMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function selectedOutputType() {
  return document.querySelector('input[name="output-type"]:checked').value;
}

function formatDuration(seconds) {
  if (!seconds) {
    return "";
  }
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function statusLabel(status) {
  return {
    queued: "대기 중",
    running: "다운로드 중",
    complete: "완료",
    failed: "실패",
    stopped: "중지됨"
  }[status] || "대기 중";
}

function outputLabel(job) {
  if (job.outputType === "audio") {
    return "MP3";
  }
  return job.quality === "best" ? "MP4 · 최고 화질" : `MP4 · ${job.quality}p`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  setTimeout(() => toast.classList.remove("is-visible"), 3000);
}

function syncQualityControls() {
  const isVideo = selectedOutputType() === "video";
  qualityOptions.classList.toggle("is-disabled", !isVideo);
  qualitySelect.disabled = !isVideo;
}

function setBusy(isBusy) {
  previewButton.disabled = isBusy;
  addButton.disabled = isBusy;
}

function requestPayload() {
  return {
    url: urlInput.value.trim(),
    mode: selectedMode(),
    outputType: selectedOutputType(),
    quality: qualitySelect.value,
    preview: lastPreview
  };
}

function renderPreview(preview) {
  lastPreview = preview;
  previewCard.classList.remove("is-hidden");
  previewThumb.style.backgroundImage = preview.thumbnail ? `url("${preview.thumbnail}")` : "";
  previewTitle.textContent = preview.title || "제목을 불러왔습니다.";
  const meta = [preview.channel, formatDuration(preview.duration)].filter(Boolean).join(" · ");
  previewMeta.textContent = meta || "다운로드 전 확인이 완료되었습니다.";
}

function hidePreview() {
  lastPreview = null;
  previewCard.classList.add("is-hidden");
  previewThumb.style.backgroundImage = "";
  previewTitle.textContent = "";
  previewMeta.textContent = "";
}

function renderQueue(state) {
  queueState = state;
  const jobs = (state.jobs || []).filter((job) => !["complete", "failed", "stopped"].includes(job.status));
  queueList.innerHTML = jobs.map(renderJob).join("");
  queueEmpty.hidden = jobs.length > 0;
  queuedCount.textContent = jobs.filter((job) => job.status === "queued").length;
  runningCount.textContent = jobs.filter((job) => job.status === "running").length;
}

function renderJob(job) {
  const title = escapeHtml(job.title || job.currentFile || job.url);
  const subtitle = escapeHtml([outputLabel(job), job.mode === "playlist" ? "재생목록" : "단일 영상"].join(" · "));
  const current = escapeHtml(job.currentFile || (job.status === "queued" ? "순서를 기다리는 중" : ""));
  const progress = Math.round(job.progress || 0);
  const details = job.logs.length
    ? `<details><summary>상세 보기</summary><pre>${escapeHtml(job.logs.map((log) => log.line).join("\n"))}</pre></details>`
    : "";
  const error = job.error ? `<p class="job-error">${escapeHtml(job.error)}</p>` : "";
  const openButton = job.outputPath
    ? `<button class="ghost small-button" data-open-path="${escapeHtml(job.outputPath)}" type="button">파일 보기</button>`
    : "";

  return `
    <article class="job-card" data-status="${job.status}">
      <div class="job-main">
        ${job.thumbnail ? `<img class="job-thumb" src="${escapeHtml(job.thumbnail)}" alt="" />` : `<div class="job-thumb placeholder"></div>`}
        <div class="job-content">
          <div class="job-topline">
            <h3>${title}</h3>
            <span class="status-pill">${statusLabel(job.status)}</span>
          </div>
          <p class="job-subtitle">${subtitle}</p>
          <div class="progress-row">
            <div class="progress-track"><span style="width: ${progress}%"></span></div>
            <strong>${progress}%</strong>
          </div>
          <p class="job-meta">${current}</p>
          <p class="job-meta">${[job.speed, job.eta ? `남은 시간 ${job.eta}` : ""].filter(Boolean).join(" · ")}</p>
          ${error}
          <div class="job-actions">${openButton}</div>
          ${details}
        </div>
      </div>
    </article>
  `;
}

function renderHistory(history) {
  completeCount.textContent = history.filter((item) => item.status === "complete").length;
  historyList.innerHTML = history.map((item) => {
    const date = item.completedAt ? new Date(item.completedAt).toLocaleString("ko-KR") : "";
    const pathButton = item.outputPath
      ? `<button class="ghost small-button" data-open-path="${escapeHtml(item.outputPath)}" type="button">파일 보기</button>`
      : "";
    return `
      <article class="history-item" data-status="${item.status}">
        <div>
          <strong>${escapeHtml(historyTitle(item))}</strong>
          <p>${escapeHtml([statusLabel(item.status), item.outputType === "audio" ? "MP3" : "MP4", date].filter(Boolean).join(" · "))}</p>
          ${item.error ? `<p class="job-error">${escapeHtml(item.error)}</p>` : ""}
        </div>
        ${pathButton}
      </article>
    `;
  }).join("");
  historyEmpty.hidden = history.length > 0;
}

function historyTitle(item) {
  if (item.title && !/^https?:\/\//i.test(item.title)) {
    return item.title;
  }
  if (item.outputPath) {
    const filename = item.outputPath.split("/").pop() || "";
    return filename.replace(/\.[^.]+$/, "").replaceAll("_", " ") || item.url;
  }
  return item.url;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshHistory() {
  renderHistory(await window.downloader.listHistory());
}

previewButton.addEventListener("click", async () => {
  if (!urlInput.value.trim()) {
    showToast("URL을 먼저 입력해주세요.");
    return;
  }
  setBusy(true);
  previewButton.textContent = "확인 중";
  const result = await window.downloader.fetchPreview(requestPayload());
  setBusy(false);
  previewButton.textContent = "미리보기";
  if (!result.ok) {
    hidePreview();
    showToast("미리보기를 불러오지 못했지만 다운로드는 추가할 수 있습니다.");
    return;
  }
  renderPreview(result.preview);
});

addButton.addEventListener("click", async () => {
  const payload = requestPayload();
  if (!payload.url) {
    showToast("다운로드할 URL을 입력해주세요.");
    return;
  }
  const result = await window.downloader.addToQueue(payload);
  if (!result.ok) {
    showToast(result.error);
    return;
  }
  showToast("대기열에 추가했습니다.");
  urlInput.value = "";
  hidePreview();
});

stopButton.addEventListener("click", async () => {
  await window.downloader.stopQueue();
  showToast("현재 다운로드를 중지했습니다.");
});

resumeButton.addEventListener("click", async () => {
  await window.downloader.startQueue();
  showToast("대기열을 다시 시작했습니다.");
});

openFolderButton.addEventListener("click", async () => {
  await window.downloader.openDownloads();
});

clearHistoryButton.addEventListener("click", async () => {
  await window.downloader.clearHistory();
  await refreshHistory();
  showToast("완료 기록을 지웠습니다.");
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-open-path]");
  if (!button) {
    return;
  }
  await window.downloader.openPath(button.dataset.openPath);
});

urlInput.addEventListener("input", hidePreview);
document.querySelectorAll('input[name="output-type"]').forEach((input) => {
  input.addEventListener("change", syncQualityControls);
});

window.downloader.onQueueUpdate((state) => {
  renderQueue(state);
  refreshHistory();
});

async function init() {
  const config = await window.downloader.getConfig();
  downloadDir.textContent = `저장 위치: ${config.downloadDir}`;
  if (!config.ytDlpPath || !config.ffmpegPath) {
    showToast("앱 내부 다운로드 도구를 찾을 수 없습니다.");
  }
  renderQueue(await window.downloader.listQueue());
  await refreshHistory();
  syncQualityControls();
}

init().catch((error) => showToast(error.message));
