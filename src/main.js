const { app, BrowserWindow, Notification, ipcMain, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DOWNLOAD_DIR = path.join(os.homedir(), "Downloads", "ClipSave Downloads");
const HISTORY_LIMIT = 80;
const PATH_HINTS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
  "C:\\Program Files\\yt-dlp",
  "C:\\ffmpeg\\bin"
];

let mainWindow;
let activeDownload = null;
let activeJobId = null;
let queuePaused = false;
const queue = [];

function historyPath() {
  return path.join(app.getPath("userData"), "download-history.json");
}

function readHistory() {
  try {
    const raw = fs.readFileSync(historyPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeHistory(history) {
  fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
  fs.writeFileSync(historyPath(), JSON.stringify(history.slice(0, HISTORY_LIMIT), null, 2));
}

function addHistory(job) {
  const history = readHistory();
  const record = {
    id: job.id,
    title: displayTitle(job),
    url: job.url,
    mode: job.mode,
    outputType: job.outputType,
    quality: job.quality,
    status: job.status,
    outputPath: job.outputPath || DOWNLOAD_DIR,
    error: job.error || "",
    completedAt: job.completedAt || new Date().toISOString()
  };
  writeHistory([record, ...history.filter((item) => item.id !== job.id)]);
}

function titleFromFile(targetPath) {
  if (!targetPath || !/\.(mp4|mp3|m4a|webm|mkv)$/i.test(targetPath)) {
    return "";
  }
  return path.basename(targetPath, path.extname(targetPath)).replaceAll("_", " ");
}

function displayTitle(job) {
  return job.title || titleFromFile(job.outputPath) || titleFromFile(job.currentFile) || job.url;
}

function binaryFileName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function platformBinDir() {
  if (process.platform === "darwin") {
    return `darwin-${process.arch}`;
  }
  if (process.platform === "win32") {
    return `win32-${process.arch}`;
  }
  return `${process.platform}-${process.arch}`;
}

function bundledBinaryCandidates(name) {
  const fileName = binaryFileName(name);
  const resourceRoot = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), "resources");
  return [
    path.join(resourceRoot, "bin", platformBinDir(), fileName),
    path.join(resourceRoot, "bin", fileName),
    path.join(resourceRoot, "bin", name)
  ];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 680,
    title: "ClipSave",
    backgroundColor: "#f6f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function resolveBinary(name) {
  for (const bundled of bundledBinaryCandidates(name)) {
    if (fs.existsSync(bundled)) {
      return bundled;
    }
  }

  const fileName = binaryFileName(name);
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [fileName], { encoding: "utf8" });
    const resolved = result.stdout.trim().split(/\r?\n/)[0];
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
    for (const dir of PATH_HINTS) {
      const candidate = path.join(dir, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  const envPath = process.env.PATH || "";
  const searchPath = [...new Set([...envPath.split(path.delimiter), ...PATH_HINTS])].join(path.delimiter);
  const result = spawnSync("/bin/zsh", ["-lc", `PATH=${JSON.stringify(searchPath)} command -v ${fileName}`], {
    encoding: "utf8"
  });

  const resolved = result.stdout.trim().split("\n")[0];
  if (resolved && fs.existsSync(resolved)) {
    return resolved;
  }

  for (const dir of PATH_HINTS) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function publicJob(job) {
  return {
    id: job.id,
    url: job.url,
    mode: job.mode,
    outputType: job.outputType,
    quality: job.quality,
    status: job.status,
    title: job.title,
    channel: job.channel,
    thumbnail: job.thumbnail,
    progress: job.progress,
    speed: job.speed,
    eta: job.eta,
    currentFile: job.currentFile,
    outputPath: job.outputPath,
    error: job.error,
    logs: job.logs.slice(-80),
    createdAt: job.createdAt,
    completedAt: job.completedAt
  };
}

function broadcastQueue() {
  send("queue:update", {
    activeJobId,
    paused: queuePaused,
    jobs: queue.map(publicJob)
  });
}

function removeJobFromQueue(job) {
  const index = queue.findIndex((item) => item.id === job.id);
  if (index >= 0) {
    queue.splice(index, 1);
  }
  broadcastQueue();
}

function updateJob(job, patch) {
  Object.assign(job, patch);
  broadcastQueue();
}

function pushLog(job, line, isError = false) {
  job.logs.push({ line, isError, at: new Date().toISOString() });
  if (job.logs.length > 160) {
    job.logs.shift();
  }
}

function rememberPath(job, targetPath) {
  if (!targetPath) {
    return;
  }
  job.seenPaths.add(targetPath);
}

function isExpectedFinalPath(job, targetPath) {
  const ext = path.extname(targetPath).toLowerCase();
  return job.outputType === "audio" ? ext === ".mp3" : ext === ".mp4";
}

function cleanupIntermediateFiles(job) {
  const observedFinalPath = [...job.seenPaths].reverse().find((candidate) => isExpectedFinalPath(job, candidate));
  const finalPath = job.outputPath && isExpectedFinalPath(job, job.outputPath) ? job.outputPath : observedFinalPath || "";
  if (finalPath) {
    job.outputPath = finalPath;
    job.currentFile = path.basename(finalPath);
    if (!job.title) {
      job.title = titleFromFile(finalPath);
    }
  }
  const finalBase = finalPath ? path.basename(finalPath, path.extname(finalPath)) : "";
  const finalDir = finalPath ? path.dirname(finalPath) : "";

  for (const candidate of job.seenPaths) {
    if (!candidate || candidate === finalPath || isExpectedFinalPath(job, candidate)) {
      continue;
    }
    if (finalPath) {
      const sameDir = path.dirname(candidate) === finalDir;
      const sameBase = path.basename(candidate, path.extname(candidate)) === finalBase;
      if (!sameDir || !sameBase) {
        continue;
      }
    }
    try {
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
        pushLog(job, `정리됨: ${path.basename(candidate)}`);
      }
    } catch (error) {
      pushLog(job, `중간 파일 정리 실패: ${path.basename(candidate)} (${error.message})`, true);
    }
  }
}

function buildVideoFormat(quality) {
  if (quality === "best") {
    return "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/best[ext=mp4]/best";
  }

  const height = Number.parseInt(quality, 10);
  return [
    `bv*[ext=mp4][height<=${height}]+ba[ext=m4a]`,
    `bv*[height<=${height}]+ba`,
    `best[ext=mp4][height<=${height}]`,
    `best[height<=${height}]`
  ].join("/");
}

function buildYtDlpArgs({ url, mode, outputType, quality, ffmpegPath }) {
  const isPlaylist = mode === "playlist";
  const outputTemplate = isPlaylist
    ? path.join(DOWNLOAD_DIR, "%(playlist_title)s", "%(playlist_index)03d - %(title)s.%(ext)s")
    : path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s");
  const baseArgs = [
    "--no-config",
    isPlaylist ? "--yes-playlist" : "--no-playlist",
    "--ignore-errors",
    "--no-keep-video",
    "--no-overwrites",
    "--continue",
    "--newline",
    "--progress",
    "--ffmpeg-location",
    path.dirname(ffmpegPath),
    "--restrict-filenames",
    "--windows-filenames",
    "--print",
    "after_move:filepath",
    "-o",
    outputTemplate
  ];

  if (outputType === "audio") {
    return [
      ...baseArgs,
      "-f",
      "bestaudio/best",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      url
    ];
  }

  return [
    ...baseArgs,
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    "-f",
    buildVideoFormat(quality),
    url
  ];
}

function parseProgress(line) {
  const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%.*?(?:at\s+([^\s]+))?.*?(?:ETA\s+([^\s]+))?/);
  if (!progressMatch) {
    return null;
  }
  return {
    progress: Math.min(100, Math.max(0, Number.parseFloat(progressMatch[1]))),
    speed: progressMatch[2] || "",
    eta: progressMatch[3] || ""
  };
}

function parseLine(job, line, isError = false) {
  pushLog(job, line, isError);

  const destination = line.match(/\[download\]\s+Destination:\s+(.+)$/);
  if (destination) {
    job.currentFile = path.basename(destination[1]);
    job.outputPath = destination[1];
    rememberPath(job, destination[1]);
  }

  const postProcessorDestination = line.match(/^\[[^\]]+\]\s+Destination:\s+(.+)$/);
  if (postProcessorDestination) {
    job.currentFile = path.basename(postProcessorDestination[1]);
    job.outputPath = postProcessorDestination[1];
    rememberPath(job, postProcessorDestination[1]);
  }

  const item = line.match(/\[download\]\s+Downloading item\s+(\d+)\s+of\s+(\d+)/);
  if (item) {
    job.currentFile = `재생목록 ${item[1]} / ${item[2]} 처리 중`;
  }

  const progress = parseProgress(line);
  if (progress) {
    Object.assign(job, progress);
  }

  if (!line.startsWith("[") && /\.(mp4|m4a|mp3|webm|mkv)$/i.test(line.trim())) {
    job.outputPath = line.trim();
    job.currentFile = path.basename(line.trim());
    rememberPath(job, line.trim());
    if (!job.title && isExpectedFinalPath(job, line.trim())) {
      job.title = titleFromFile(line.trim());
    }
  }

  broadcastQueue();
}

function notifyComplete(job) {
  if (!Notification.isSupported()) {
    return;
  }
  new Notification({
    title: "다운로드 완료",
    body: job.title || job.currentFile || "파일 저장이 완료되었습니다."
  }).show();
}

function processNext() {
  if (activeDownload || queuePaused) {
    return;
  }

  const job = queue.find((item) => item.status === "queued");
  if (!job) {
    activeJobId = null;
    broadcastQueue();
    return;
  }

  const ytDlpPath = resolveBinary("yt-dlp");
  const ffmpegPath = resolveBinary("ffmpeg");
  if (!ytDlpPath || !ffmpegPath) {
    updateJob(job, {
      status: "failed",
      error: "앱 내부 다운로드 도구를 찾을 수 없습니다.",
      completedAt: new Date().toISOString()
      });
      addHistory(job);
      removeJobFromQueue(job);
      processNext();
      return;
  }

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  activeJobId = job.id;
  updateJob(job, {
    status: "running",
    progress: 0,
    speed: "",
    eta: "",
    error: ""
  });

  const args = buildYtDlpArgs({ ...job, ffmpegPath });
  pushLog(job, `$ ${ytDlpPath} ${args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`);
  const child = spawn(ytDlpPath, args, {
    env: {
      ...process.env,
      PATH: [...new Set([path.dirname(ytDlpPath), path.dirname(ffmpegPath), ...PATH_HINTS])].join(path.delimiter)
    }
  });
  activeDownload = child;

  child.stdout.on("data", (data) => {
    String(data)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => parseLine(job, line));
  });

  child.stderr.on("data", (data) => {
    String(data)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => parseLine(job, line, true));
  });

  child.on("error", (error) => {
    activeDownload = null;
    activeJobId = null;
    updateJob(job, {
      status: "failed",
      error: error.message,
      completedAt: new Date().toISOString()
    });
    addHistory(job);
    removeJobFromQueue(job);
    processNext();
  });

  child.on("close", (code, signal) => {
    activeDownload = null;
    activeJobId = null;
    if (signal) {
      updateJob(job, {
        status: "stopped",
        error: "사용자가 다운로드를 중지했습니다.",
        completedAt: new Date().toISOString()
      });
      addHistory(job);
      removeJobFromQueue(job);
      return;
    }
    if (code === 0) {
      cleanupIntermediateFiles(job);
      updateJob(job, {
        status: "complete",
        progress: 100,
        eta: "",
        completedAt: new Date().toISOString()
      });
      addHistory(job);
      removeJobFromQueue(job);
      notifyComplete(job);
      processNext();
      return;
    }
    updateJob(job, {
      status: "failed",
      error: `다운로드가 완료되지 않았습니다. 다시 시도해주세요. (code ${code})`,
      completedAt: new Date().toISOString()
    });
    addHistory(job);
    removeJobFromQueue(job);
    processNext();
  });
}

function normalizeRequest(request) {
  const url = String(request?.url || "").trim();
  const mode = request?.mode === "playlist" ? "playlist" : "single";
  const outputType = request?.outputType === "audio" ? "audio" : "video";
  const quality = ["best", "1080", "720", "480", "360", "240", "144"].includes(request?.quality)
    ? request.quality
    : "best";
  return { url, mode, outputType, quality };
}

function parsePreviewJson(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const jsonLine = lines.find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error("미리보기 정보를 찾을 수 없습니다.");
  }
  const data = JSON.parse(jsonLine);
  return {
    title: data.title || data.fulltitle || "",
    channel: data.channel || data.uploader || "",
    thumbnail: data.thumbnail || "",
    duration: data.duration || 0
  };
}

ipcMain.handle("app:get-config", () => ({
  downloadDir: DOWNLOAD_DIR,
  ytDlpPath: resolveBinary("yt-dlp"),
  ffmpegPath: resolveBinary("ffmpeg")
}));

ipcMain.handle("preview:fetch", async (_event, request) => {
  const { url, mode } = normalizeRequest(request);
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return { ok: false, error: "올바른 URL을 입력해주세요." };
  }

  const ytDlpPath = resolveBinary("yt-dlp");
  if (!ytDlpPath) {
    return { ok: false, error: "다운로드 도구를 찾을 수 없습니다." };
  }

  const args = [
    mode === "playlist" ? "--yes-playlist" : "--no-playlist",
    "--skip-download",
    "--dump-json",
    "--playlist-items",
    "1",
    url
  ];

  return await new Promise((resolve) => {
    const child = spawn(ytDlpPath, args);
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, error: "미리보기를 불러오지 못했습니다." });
    }, 20000);

    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.stderr.on("data", (data) => {
      stderr += String(data);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve({ ok: false, error: stderr.split(/\r?\n/).filter(Boolean).pop() || "미리보기 실패" });
        return;
      }
      try {
        resolve({ ok: true, preview: parsePreviewJson(stdout) });
      } catch (error) {
        resolve({ ok: false, error: error.message });
      }
    });
  });
});

ipcMain.handle("queue:add", (_event, request) => {
  const normalized = normalizeRequest(request);
  if (!/^https?:\/\/\S+$/i.test(normalized.url)) {
    return { ok: false, error: "올바른 http/https URL을 입력해주세요." };
  }

  const job = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...normalized,
    title: request?.preview?.title || "",
    channel: request?.preview?.channel || "",
    thumbnail: request?.preview?.thumbnail || "",
    status: "queued",
    progress: 0,
    speed: "",
    eta: "",
    currentFile: "",
    outputPath: "",
    error: "",
    logs: [],
    seenPaths: new Set(),
    createdAt: new Date().toISOString(),
    completedAt: ""
  };
  queue.push(job);
  queuePaused = false;
  broadcastQueue();
  processNext();
  return { ok: true, job: publicJob(job) };
});

ipcMain.handle("queue:start", () => {
  queuePaused = false;
  processNext();
  broadcastQueue();
  return { ok: true };
});

ipcMain.handle("queue:stop", () => {
  queuePaused = true;
  if (!activeDownload) {
    broadcastQueue();
    return { ok: true };
  }
  activeDownload.kill("SIGTERM");
  return { ok: true };
});

ipcMain.handle("queue:list", () => {
  return {
    activeJobId,
    paused: queuePaused,
    jobs: queue.map(publicJob)
  };
});

ipcMain.handle("history:list", () => readHistory());

ipcMain.handle("history:clear", () => {
  writeHistory([]);
  return { ok: true };
});

ipcMain.handle("folder:open-downloads", async () => {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const result = await shell.openPath(DOWNLOAD_DIR);
  return result ? { ok: false, error: result } : { ok: true };
});

ipcMain.handle("folder:open-path", async (_event, targetPath) => {
  shell.showItemInFolder(targetPath);
  return { ok: true };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (activeDownload) {
    activeDownload.kill("SIGTERM");
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
