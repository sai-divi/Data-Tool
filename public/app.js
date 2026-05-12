const state = {
  uploadedImage: null,
  lastResult: createEmptyResult(),
  activeMode: "web",
  connection: {
    online: false,
    checkedAt: null
  }
};

const platformProfiles = {
  youtube: {
    label: "YouTube",
    direct: (handle) => `https://www.youtube.com/@${encodeURIComponent(handle)}`,
    search: (handle) => `https://www.youtube.com/results?search_query=${encodeURIComponent(handle)}`
  },
  instagram: {
    label: "Instagram",
    direct: (handle) => `https://www.instagram.com/${encodeURIComponent(handle)}/`,
    search: (handle) => `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${handle}"`)}`
  },
  tiktok: {
    label: "TikTok",
    direct: (handle) => `https://www.tiktok.com/@${encodeURIComponent(handle)}`,
    search: (handle) => `https://www.google.com/search?q=${encodeURIComponent(`site:tiktok.com/@ "${handle}"`)}`
  },
  x: {
    label: "X",
    direct: (handle) => `https://x.com/${encodeURIComponent(handle)}`,
    search: (handle) => `https://www.google.com/search?q=${encodeURIComponent(`site:x.com "${handle}"`)}`
  },
  reddit: {
    label: "Reddit",
    direct: (handle) => `https://www.reddit.com/user/${encodeURIComponent(handle)}/`,
    search: (handle) => `https://www.google.com/search?q=${encodeURIComponent(`site:reddit.com/user "${handle}"`)}`
  },
  github: {
    label: "GitHub",
    direct: (handle) => `https://github.com/${encodeURIComponent(handle)}`,
    search: (handle) => `https://www.google.com/search?q=${encodeURIComponent(`site:github.com "${handle}"`)}`
  },
  twitch: {
    label: "Twitch",
    direct: (handle) => `https://www.twitch.tv/${encodeURIComponent(handle)}`,
    search: (handle) => `https://www.google.com/search?q=${encodeURIComponent(`site:twitch.tv "${handle}"`)}`
  }
};

const elements = {
  modeButtons: document.querySelectorAll(".mode-button"),
  webGrabPanel: document.querySelector("#webGrabPanel"),
  osintPanel: document.querySelector("#osintPanel"),
  transcriptPanel: document.querySelector("#transcriptPanel"),
  transcriptInput: document.querySelector("#transcriptInput"),
  webInput: document.querySelector("#webInput"),
  targetType: document.querySelector("#targetType"),
  rawInput: document.querySelector("#rawInput"),
  imageInput: document.querySelector("#imageInput"),
  dropZone: document.querySelector("#dropZone"),
  ocrButton: document.querySelector("#ocrButton"),
  previewWrap: document.querySelector("#previewWrap"),
  imagePreview: document.querySelector("#imagePreview"),
  consentCheck: document.querySelector("#consentCheck"),
  onlineMode: document.querySelector("#onlineMode"),
  connectionBadge: document.querySelector("#connectionBadge"),
  connectionText: document.querySelector("#connectionText"),
  connectionButton: document.querySelector("#connectionButton"),
  statusBox: document.querySelector("#statusBox"),
  runButton: document.querySelector("#runButton"),
  clearButton: document.querySelector("#clearButton"),
  copyJsonButton: document.querySelector("#copyJsonButton"),
  copyReportButton: document.querySelector("#copyReportButton"),
  copyTranscriptButton: document.querySelector("#copyTranscriptButton"),
  openAllButton: document.querySelector("#openAllButton"),
  metricTargets: document.querySelector("#metricTargets"),
  metricSources: document.querySelector("#metricSources"),
  metricFlags: document.querySelector("#metricFlags"),
  summaryText: document.querySelector("#summaryText"),
  flagList: document.querySelector("#flagList"),
  findingList: document.querySelector("#findingList"),
  sourceList: document.querySelector("#sourceList"),
  reportOutput: document.querySelector("#reportOutput")
};

init();

function init() {
  bindTabs();
  bindInputs();
  renderResult(state.lastResult);
  updateConnectionStatus(false);
  refreshIcons();
}

function bindTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.tab}Tab`).classList.add("active");
    });
  });
}

function bindInputs() {
  elements.runButton.addEventListener("click", runCurrentMode);
  elements.clearButton.addEventListener("click", resetWorkspace);
  elements.ocrButton.addEventListener("click", runOcr);
  elements.copyJsonButton.addEventListener("click", copyJson);
  elements.copyReportButton.addEventListener("click", copyReport);
  elements.copyTranscriptButton.addEventListener("click", copyTranscript);
  elements.openAllButton.addEventListener("click", openCheckedSources);
  elements.connectionButton.addEventListener("click", () => updateConnectionStatus(true));
  elements.onlineMode.addEventListener("change", () => {
    if (elements.onlineMode.checked) {
      updateConnectionStatus(true);
    } else {
      setStatus("Online web collection disabled. Local parsing still works.");
    }
  });
  window.addEventListener("online", () => updateConnectionStatus(true));
  window.addEventListener("offline", () => {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
    setConnectionDisplay(false, "Browser offline", "Offline");
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.imageInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) setUploadedImage(file);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragging");
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file && file.type.startsWith("image/")) setUploadedImage(file);
  });
}

function setMode(mode) {
  state.activeMode = mode;
  elements.modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  elements.webGrabPanel.classList.toggle("hidden", mode !== "web");
  elements.osintPanel.classList.toggle("hidden", mode !== "osint");
  elements.transcriptPanel.classList.toggle("hidden", mode !== "transcript");
  elements.runButton.lastChild.textContent = " Run";
  if (mode === "web") setStatus("Ready to grab public web pages.");
  else if (mode === "transcript") setStatus("Ready. Paste a YouTube video URL.");
  else setStatus("Ready for OSINT collection.");
}

async function updateConnectionStatus(force = false) {
  if (!navigator.onLine) {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
    setConnectionDisplay(false, "Browser reports offline.", "Offline");
    return false;
  }

  setConnectionDisplay(null, "Checking internet access...", "Checking");
  elements.connectionButton.disabled = true;

  try {
    const response = await fetch(`/api/connection${force ? "?force=1" : ""}`, { cache: "no-store" });
    const payload = await response.json();
    const online = response.ok && payload.online;
    state.connection = { ...payload, online };

    if (online) {
      setConnectionDisplay(true, "Internet access verified.", "Online");
      return true;
    }

    setConnectionDisplay(false, payload.error || "Internet access unavailable.", "Offline");
    return false;
  } catch {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
    setConnectionDisplay(false, "Connection check failed.", "Offline");
    return false;
  } finally {
    elements.connectionButton.disabled = false;
    refreshIcons();
  }
}

async function ensureOnlineConnection() {
  if (!navigator.onLine) {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
    setConnectionDisplay(false, "Browser offline", "Offline");
    return false;
  }

  const checkedAt = state.connection.checkedAt ? new Date(state.connection.checkedAt).getTime() : 0;
  if (state.connection.online && Date.now() - checkedAt < 30000) {
    return true;
  }

  return updateConnectionStatus(true);
}

function setConnectionDisplay(online, text, label) {
  const className = online === null ? "unknown" : online ? "online" : "offline";
  elements.connectionBadge.className = `connection-pill ${className}`;
  elements.connectionBadge.textContent = label;
  elements.connectionText.textContent = text;
}

function createEmptyResult() {
  return {
    createdAt: new Date().toISOString(),
    findings: [],
    sources: [],
    flags: [],
    summary: "Run a collection to generate a concise public-source brief.",
    rawText: "",
    youtubeMetadata: [],
    onlineMetadata: [],
    webPages: [],
    transcriptResult: null
  };
}

async function runCurrentMode() {
  if (state.activeMode === "web") {
    await runWebGrab();
    return;
  }

  if (state.activeMode === "transcript") {
    await runYouTubeTranscript();
    return;
  }

  await runOsintCollection();
}

async function runWebGrab() {
  if (!elements.consentCheck.checked) {
    setStatus("Collection paused until public/authorized use is confirmed.", "warn");
    return;
  }

  const rawText = elements.webInput.value.trim();
  if (!rawText) {
    setStatus("Add at least one public URL.", "warn");
    return;
  }

  const result = createEmptyResult();
  result.rawText = rawText;
  result.mode = "web";

  const urls = extractUrls(rawText);
  if (!urls.length) {
    rawText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6)
      .forEach((query) => {
        addSource(result, {
          title: `Web search: ${query}`,
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          kind: "Search",
          target: query,
          checked: true
        });
      });
    addFlag(result, "warn", "No URLs were found. Search leads were created instead.");
    addBaselineFlags(result);
    result.summary = buildSummary(result);
    result.report = buildReport(result);
    state.lastResult = result;
    renderResult(result);
    setStatus("Search leads created. Add URLs to grab page content.", "warn");
    return;
  }

  const canCollectOnline = await ensureOnlineConnection();
  if (!canCollectOnline) {
    setStatus("Internet is required for web grabbing.", "warn");
    return;
  }

  setStatus("Grabbing public web pages...");

  try {
    const response = await fetch("/api/grab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls })
    });
    const payload = await response.json();

    const grabbedPages = payload.results || [];
    const failures = payload.failures || [];

    grabbedPages.forEach((page) => addWebPageFinding(result, page));
    failures.forEach((failure) => addFlag(result, "warn", `${failure.url}: ${failure.error}`));
    if (!grabbedPages.length && payload.error) {
      addFlag(result, "warn", payload.error);
    }

    addBaselineFlags(result);
    result.summary = buildSummary(result);
    result.report = buildReport(result);
    state.lastResult = result;
    renderResult(result);

    setStatus(`Web grab complete: ${grabbedPages.length} page${grabbedPages.length === 1 ? "" : "s"} grabbed.`);
  } catch {
    setStatus("Web grab failed.", "warn");
  }
}

function addWebPageFinding(result, page) {
  result.webPages.push(page);

  const title = page.title || page.finalUrl || page.requestedUrl;
  addFinding(result, {
    type: "Web page",
    value: title,
    confidence: page.ok ? "high" : "medium",
    source: page.finalUrl || page.requestedUrl,
    notes: page.description || page.text || "Public web page grabbed.",
    tags: ["web", "web-grab"]
  });

  if (page.text) {
    addFinding(result, {
      type: "Web text",
      value: page.text.slice(0, 180),
      confidence: "medium",
      source: page.finalUrl || page.requestedUrl,
      notes: page.text,
      tags: ["web", "text"]
    });
  }

  page.headings.slice(0, 5).forEach((heading) => {
    addFinding(result, {
      type: "Web heading",
      value: heading,
      confidence: "medium",
      source: page.finalUrl || page.requestedUrl,
      notes: "Heading found on the grabbed page.",
      tags: ["web", "heading"]
    });
  });

  addSource(result, {
    title,
    url: page.finalUrl || page.requestedUrl,
    kind: "Grabbed",
    target: new URL(page.finalUrl || page.requestedUrl).hostname,
    checked: true
  });

  page.links.slice(0, 10).forEach((link) => {
    addSource(result, {
      title: link.label || link.url,
      url: link.url,
      kind: "Page link",
      target: title,
      checked: false
    });
  });
}

async function runYouTubeTranscript() {
  if (!elements.consentCheck.checked) {
    setStatus("Collection paused until public/authorized use is confirmed.", "warn");
    return;
  }

  const url = elements.transcriptInput.value.trim();
  if (!url) {
    setStatus("Paste a YouTube video URL first.", "warn");
    return;
  }

  const canCollectOnline = await ensureOnlineConnection();
  if (!canCollectOnline) {
    setStatus("Internet is required for transcript fetching.", "warn");
    return;
  }

  setStatus("Fetching YouTube transcript...");
  elements.runButton.disabled = true;

  try {
    const response = await fetch(`/api/youtube/transcript?url=${encodeURIComponent(url)}`, { cache: "no-store" });
    const data = await response.json();

    const result = createEmptyResult();
    result.rawText = url;
    result.mode = "transcript";

    if (data.ok) {
      result.transcriptResult = data;
      addFinding(result, {
        type: "YouTube Transcript",
        value: data.title || `Video ${data.videoId}`,
        confidence: "high",
        source: `https://www.youtube.com/watch?v=${data.videoId}`,
        notes: `Channel: ${data.channel || "Unknown"} | ${data.chunkCount} segments | ${data.wordCount} words`,
        tags: ["youtube", "transcript"]
      });
      if (data.flaggedSegments?.length) {
        addFinding(result, {
          type: "Flagged Content Alert",
          value: `${data.flaggedSegments.length} potentially harmful segment(s) detected`,
          confidence: "medium",
          source: `https://www.youtube.com/watch?v=${data.videoId}`,
          notes: `Reasons: ${[...new Set(data.flaggedSegments.map((s) => s.reason))].join(", ")}`,
          tags: ["youtube", "transcript", "flagged"]
        });
        data.flaggedSegments.forEach((seg) => {
          const m = Math.floor(seg.start / 60);
          const s = Math.floor(seg.start % 60);
          const ts = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
          addFlag(result, "danger", `[${ts}] ${seg.reason}: "${seg.text.slice(0, 120)}"`);
        });
      }
      addSource(result, {
        title: data.title || "YouTube Video",
        url: `https://www.youtube.com/watch?v=${data.videoId}`,
        kind: "YouTube",
        target: data.videoId,
        checked: true
      });
    } else {
      addFlag(result, "warn", data.error || "Transcript could not be fetched.");
    }

    addBaselineFlags(result);
    result.summary = buildSummary(result);
    result.report = buildReport(result);
    state.lastResult = result;
    renderResult(result);

    setStatus(data.ok
      ? `Transcript grabbed: ${data.chunkCount} segments, ${data.wordCount} words.`
      : `Transcript failed: ${data.error}`);
  } catch {
    setStatus("Transcript fetch failed.", "warn");
  } finally {
    elements.runButton.disabled = false;
  }
}

async function runOsintCollection() {
  if (!elements.consentCheck.checked) {
    setStatus("Collection paused until public/authorized use is confirmed.", "warn");
    return;
  }

  const rawText = elements.rawInput.value.trim();
  if (!rawText && !state.uploadedImage) {
    setStatus("Add a handle, URL, note, or screenshot first.", "warn");
    return;
  }

  setStatus("Parsing public-source leads...");
  const result = analyzeInput(rawText, elements.targetType.value);
  state.lastResult = result;
  renderResult(result);

  if (elements.onlineMode.checked) {
    const canCollectOnline = await ensureOnlineConnection();
    if (canCollectOnline) {
      await enrichYouTubeFindings(result);
      await enrichPublicSourceMetadata(result);
    } else {
      addFlag(result, "warn", "Live web collection skipped because no internet connection was verified.");
      result.summary = buildSummary(result);
      result.report = buildReport(result);
      renderResult(result);
      setStatus("Local parsing complete. Internet is required for live web collection.", "warn");
      return;
    }
  } else {
    addFlag(result, "warn", "Online web collection is disabled. Results are local leads only.");
    result.summary = buildSummary(result);
    result.report = buildReport(result);
  }

  renderResult(result);
  setStatus(`Collection complete: ${result.findings.length} findings and ${result.sources.length} source leads.`);
}

function analyzeInput(rawText, selectedType) {
  const result = createEmptyResult();
  result.rawText = rawText;

  const urls = extractUrls(rawText);
  const handles = extractHandles(rawText);
  const emails = extractEmails(rawText);
  const phoneMatches = extractPossiblePhones(rawText);
  const dates = extractDates(rawText);

  urls.forEach((url) => addUrlFinding(result, url));
  handles.forEach((handle) => addHandleFinding(result, handle, selectedType));

  if (selectedType === "youtube") {
    inferSingleHandle(rawText).forEach((handle) => addHandleFinding(result, handle, "youtube"));
  }

  if (selectedType === "instagram") {
    inferSingleHandle(rawText).forEach((handle) => addHandleFinding(result, handle, "instagram"));
  }

  emails.forEach((email) => {
    addFinding(result, {
      type: "Sensitive contact",
      value: email,
      confidence: "medium",
      source: "Input text",
      notes: "Email address detected. Keep it redacted unless it is clearly public and relevant.",
      tags: ["sensitive", "redact"]
    });
  });

  if (phoneMatches.length) {
    addFlag(result, "danger", `${phoneMatches.length} possible phone number${phoneMatches.length === 1 ? "" : "s"} detected. Redact before sharing reports.`);
  }

  if (selectedType === "screenshot" || /instagram|message|dm|chat/i.test(rawText)) {
    addFlag(result, "warn", "Message screenshots can contain private conversation data. Keep collection limited to authorized cases.");
  }

  if (dates.length) {
    addFinding(result, {
      type: "Timeline clue",
      value: dates.join(", "),
      confidence: "low",
      source: "Input text",
      notes: "Dates or times may help order events, but should be verified against source context.",
      tags: ["timeline"]
    });
  }

  if (!result.findings.length && rawText) {
    addFinding(result, {
      type: "Unstructured note",
      value: rawText.slice(0, 180),
      confidence: "low",
      source: "Input text",
      notes: "No platform handle or URL was detected automatically.",
      tags: ["manual-review"]
    });
  }

  addBaselineFlags(result);
  addCrossPlatformSources(result);
  result.summary = buildSummary(result);
  result.report = buildReport(result);
  return result;
}

function addUrlFinding(result, url) {
  const platform = classifyUrl(url);
  const parsedHandle = extractHandleFromUrl(url);

  addFinding(result, {
    type: `${platform.label} URL`,
    value: url,
    confidence: "high",
    source: "Input text",
    notes: parsedHandle ? `Detected handle: ${parsedHandle}` : "Public URL detected.",
    tags: [platform.key, "url"].filter(Boolean)
  });

  addSource(result, {
    title: `${platform.label} direct URL`,
    url,
    kind: "Direct",
    target: parsedHandle || url,
    checked: true
  });

  if (parsedHandle) {
    addHandleFinding(result, parsedHandle, platform.key);
  }
}

function addHandleFinding(result, rawHandle, selectedType = "auto") {
  const handle = cleanHandle(rawHandle);
  if (!handle || handle.length < 2) return;

  const platformKey = selectedType !== "auto" && platformProfiles[selectedType] ? selectedType : inferPlatformForHandle(rawHandle);
  const platformLabel = platformProfiles[platformKey]?.label || "Username";

  addFinding(result, {
    type: `${platformLabel} handle`,
    value: `@${handle}`,
    confidence: rawHandle.startsWith("@") || selectedType !== "auto" ? "high" : "medium",
    source: "Input text",
    notes: "Treat same-handle matches across platforms as leads until verified.",
    tags: [platformKey, "handle"].filter(Boolean)
  });

  if (platformProfiles[platformKey]) {
    addSource(result, {
      title: `${platformProfiles[platformKey].label} profile check`,
      url: platformProfiles[platformKey].direct(handle),
      kind: "Profile",
      target: `@${handle}`,
      checked: true
    });
    addSource(result, {
      title: `${platformProfiles[platformKey].label} search`,
      url: platformProfiles[platformKey].search(handle),
      kind: "Search",
      target: `@${handle}`,
      checked: true
    });
  } else {
    addSource(result, {
      title: "General exact-match search",
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${handle}"`)}`,
      kind: "Search",
      target: `@${handle}`,
      checked: true
    });
  }
}

function addCrossPlatformSources(result) {
  const handles = unique(
    result.findings
      .filter((finding) => finding.tags.includes("handle"))
      .map((finding) => cleanHandle(finding.value))
  );

  handles.forEach((handle) => {
    Object.entries(platformProfiles).forEach(([key, platform]) => {
      const exists = result.sources.some((source) => source.url === platform.direct(handle));
      if (!exists) {
        addSource(result, {
          title: `${platform.label} same-handle lead`,
          url: platform.direct(handle),
          kind: "Cross-platform",
          target: `@${handle}`,
          checked: false
        });
      }
    });

    addSource(result, {
      title: "Exact phrase web search",
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${handle}"`)}`,
      kind: "Search",
      target: `@${handle}`,
      checked: false
    });
  });
}

async function enrichYouTubeFindings(result) {
  const youtubeTargets = unique(
    result.findings
      .filter((finding) => finding.tags.includes("youtube"))
      .map((finding) => finding.value)
  );

  if (!youtubeTargets.length) return;

  setStatus("Checking public YouTube metadata...");

  for (const target of youtubeTargets.slice(0, 4)) {
    try {
      const response = await fetch(`/api/youtube?target=${encodeURIComponent(target)}`);
      const metadata = await response.json();
      result.youtubeMetadata.push(metadata);

      if (metadata.ok && metadata.title) {
        addFinding(result, {
          type: "YouTube metadata",
          value: metadata.title,
          confidence: "medium",
          source: metadata.finalUrl || metadata.requestedUrl,
          notes: metadata.description || "Public profile metadata was available.",
          tags: ["youtube", "metadata"]
        });
      } else if (metadata.error) {
        addFlag(result, "warn", `YouTube lookup skipped for ${target}: ${metadata.error}`);
      }
    } catch {
      addFlag(result, "warn", `YouTube lookup unavailable for ${target}. Use the generated source links instead.`);
    }
  }

  result.summary = buildSummary(result);
  result.report = buildReport(result);
}

async function enrichPublicSourceMetadata(result) {
  const metadataTargets = unique(
    result.sources
      .filter((source) => source.kind === "Direct" || source.kind === "Profile")
      .filter((source) => classifyUrl(source.url).key !== "youtube")
      .map((source) => source.url)
  ).slice(0, 6);

  if (!metadataTargets.length) return;

  let failedLookups = 0;

  for (let index = 0; index < metadataTargets.length; index += 1) {
    const target = metadataTargets[index];
    setStatus(`Scraping public metadata ${index + 1}/${metadataTargets.length}...`);

    try {
      const response = await fetch(`/api/metadata?url=${encodeURIComponent(target)}`);
      const metadata = await response.json();
      result.onlineMetadata.push(metadata);

      if (metadata.title) {
        const platform = classifyUrl(metadata.finalUrl || metadata.requestedUrl || target);
        addFinding(result, {
          type: `${platform.label} public metadata`,
          value: metadata.title,
          confidence: metadata.ok ? "medium" : "low",
          source: metadata.finalUrl || metadata.requestedUrl || target,
          notes: metadata.description || "Public metadata was found on the allowlisted page.",
          tags: [platform.key, "metadata", "online"].filter(Boolean)
        });
      } else if (metadata.error) {
        failedLookups += 1;
      }
    } catch {
      failedLookups += 1;
    }
  }

  if (failedLookups) {
    addFlag(result, "warn", `${failedLookups} live metadata lookup${failedLookups === 1 ? "" : "s"} could not be completed.`);
  }

  result.summary = buildSummary(result);
  result.report = buildReport(result);
}

function extractUrls(text) {
  const matches = text.match(/\bhttps?:\/\/[^\s<>"']+/gi) || [];
  return unique(matches.map((url) => url.replace(/[),.;]+$/, "")));
}

function extractHandles(text) {
  const explicitHandles = text.match(/(^|[^\w])@([\w.-]{2,30})/g) || [];
  const fromUrls = extractUrls(text).map(extractHandleFromUrl).filter(Boolean);
  return unique([
    ...explicitHandles.map((match) => match.replace(/[^\w@.-]/g, "")),
    ...fromUrls
  ]);
}

function extractHandleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (host.includes("youtube.com") && parts[0]?.startsWith("@")) return parts[0];
    if (host.includes("instagram.com") && parts[0]) return parts[0];
    if (host.includes("tiktok.com") && parts[0]?.startsWith("@")) return parts[0];
    if ((host === "x.com" || host === "twitter.com") && parts[0]) return parts[0];
    if (host.includes("reddit.com") && parts[0] === "user" && parts[1]) return parts[1];
    if (host.includes("github.com") && parts[0]) return parts[0];
    if (host.includes("twitch.tv") && parts[0]) return parts[0];
  } catch {
    return "";
  }
  return "";
}

function extractEmails(text) {
  return unique(text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []);
}

function extractPossiblePhones(text) {
  return unique(text.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g) || []);
}

function extractDates(text) {
  const dateLike = text.match(/\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/gi) || [];
  return unique(dateLike);
}

function inferSingleHandle(text) {
  const cleaned = text.trim().replace(/^@/, "");
  if (/^[\w.-]{2,30}$/.test(cleaned)) return [cleaned];
  return [];
}

function cleanHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^\/+/, "")
    .replace(/[^\w.-]/g, "")
    .slice(0, 30);
}

function classifyUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("youtube.com") || host === "youtu.be") return { key: "youtube", label: "YouTube" };
    if (host.includes("instagram.com")) return { key: "instagram", label: "Instagram" };
    if (host.includes("tiktok.com")) return { key: "tiktok", label: "TikTok" };
    if (host === "x.com" || host === "twitter.com") return { key: "x", label: "X" };
    if (host.includes("reddit.com")) return { key: "reddit", label: "Reddit" };
    if (host.includes("github.com")) return { key: "github", label: "GitHub" };
    if (host.includes("twitch.tv")) return { key: "twitch", label: "Twitch" };
    return { key: "web", label: host };
  } catch {
    return { key: "web", label: "Web" };
  }
}

function inferPlatformForHandle(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("youtube")) return "youtube";
  if (lower.includes("instagram")) return "instagram";
  if (lower.includes("tiktok")) return "tiktok";
  if (lower.includes("github")) return "github";
  return "generic";
}

function addFinding(result, finding) {
  const normalizedValue = String(finding.value || "").trim();
  if (!normalizedValue) return;

  const duplicate = result.findings.some((item) => item.type === finding.type && item.value === normalizedValue);
  if (duplicate) return;

  result.findings.push({
    id: crypto.randomUUID(),
    type: finding.type,
    value: normalizedValue,
    confidence: finding.confidence || "low",
    source: finding.source || "Input",
    notes: finding.notes || "",
    tags: finding.tags || []
  });
}

function addSource(result, source) {
  if (!source.url || result.sources.some((item) => item.url === source.url)) return;
  result.sources.push({
    id: crypto.randomUUID(),
    title: source.title,
    url: source.url,
    kind: source.kind,
    target: source.target,
    checked: Boolean(source.checked)
  });
}

function addFlag(result, severity, message) {
  if (result.flags.some((flag) => flag.message === message)) return;
  result.flags.push({ id: crypto.randomUUID(), severity, message });
}

function addBaselineFlags(result) {
  addFlag(result, "warn", "Verify every lead against the original public source before acting on it.");
  if (result.findings.some((finding) => finding.tags.includes("sensitive"))) {
    addFlag(result, "danger", "Sensitive personal data detected. Minimize, redact, and avoid republishing it.");
  }
}

function buildSummary(result) {
  const handles = result.findings.filter((finding) => finding.tags.includes("handle"));
  const urls = result.findings.filter((finding) => finding.tags.includes("url"));
  const metadata = result.findings.filter((finding) => finding.tags.includes("metadata"));
  const webPages = result.webPages || [];

  if (result.transcriptResult?.ok) {
    const t = result.transcriptResult;
    const flags = t.flaggedSegments?.length || 0;
    const base = `YouTube transcript grabbed: "${t.title || "Untitled"}" by ${t.channel || "Unknown"} — ${t.chunkCount} segments, ${t.wordCount} words.`;
    return flags ? `${base} ⚠ ${flags} potentially harmful segment(s) flagged. See transcript tab.` : `${base} No harmful content detected.`;
  }

  if (!result.findings.length && !result.sources.length) {
    return "No public-source findings have been created yet.";
  }

  if (!result.findings.length && result.sources.length) {
    return `${result.sources.length} source lead${result.sources.length === 1 ? "" : "s"} created. Add public URLs to grab page content.`;
  }

  const parts = [];
  if (webPages.length) parts.push(`${webPages.length} public web page${webPages.length === 1 ? "" : "s"} grabbed`);
  if (handles.length) parts.push(`${handles.length} username or handle lead${handles.length === 1 ? "" : "s"} detected`);
  if (urls.length) parts.push(`${urls.length} direct URL${urls.length === 1 ? "" : "s"} captured`);
  if (metadata.length) parts.push(`${metadata.length} public metadata item${metadata.length === 1 ? "" : "s"} added`);

  const summary = parts.length ? parts.join(", ") : `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} created`;
  const highestSignal = handles[0]?.value || urls[0]?.value || result.findings[0]?.value;
  return `${summary}. Starting point: ${highestSignal}. Verify all grabbed information against the original public source.`;
}

function buildReport(result) {
  if (result.transcriptResult?.report) {
    const data = result.transcriptResult;
    if (data.flaggedSegments?.length) {
      return "⚠ ===== FLAGGED CONTENT REPORT ===== ⚠\n\n" + data.report;
    }
    return data.report;
  }

  const lines = [
    "# Information Collection Report",
    "",
    `Created: ${new Date(result.createdAt).toLocaleString()}`,
    "",
    "## Analyst Summary",
    result.summary,
    ""
  ];

  if (result.webPages?.length) {
    lines.push("## Grabbed Web Pages");
    result.webPages.forEach((page) => {
      lines.push(`- ${page.title || page.finalUrl}: ${page.finalUrl || page.requestedUrl}`);
      if (page.description) lines.push(`  Description: ${page.description}`);
      if (page.text) lines.push(`  Text: ${page.text}`);
    });
    lines.push("");
  }

  lines.push("## Findings");

  if (!result.findings.length) {
    lines.push("- No findings yet.");
  } else {
    result.findings.forEach((finding) => {
      lines.push(`- [${finding.confidence}] ${finding.type}: ${finding.value}`);
      if (finding.notes) lines.push(`  Notes: ${finding.notes}`);
      if (finding.source) lines.push(`  Source: ${finding.source}`);
    });
  }

  lines.push("", "## Source Leads");
  if (!result.sources.length) {
    lines.push("- No source leads yet.");
  } else {
    result.sources.forEach((source) => {
      lines.push(`- ${source.title}: ${source.url}`);
    });
  }

  lines.push("", "## Safety Flags");
  result.flags.forEach((flag) => {
    lines.push(`- [${flag.severity}] ${flag.message}`);
  });

  return lines.join("\n");
}

function renderResult(result) {
  elements.metricTargets.textContent = String(result.findings.length);
  elements.metricSources.textContent = String(result.sources.length);
  elements.metricFlags.textContent = String(result.flags.length);
  elements.summaryText.textContent = result.summary;
  elements.reportOutput.value = result.report || buildReport(result);

  renderFlags(result.flags);
  renderFindings(result.findings);
  renderSources(result.sources);
  renderTranscript(result.transcriptResult);
  refreshIcons();
}

function renderFlags(flags) {
  if (!flags.length) {
    elements.flagList.innerHTML = `<div class="empty-state">No flags yet.</div>`;
    return;
  }

  elements.flagList.innerHTML = flags
    .map((flag) => `<div class="flag ${escapeHtml(flag.severity)}">${escapeHtml(flag.message)}</div>`)
    .join("");
}

function renderFindings(findings) {
  if (!findings.length) {
    elements.findingList.innerHTML = `<div class="empty-state">No findings yet.</div>`;
    return;
  }

  elements.findingList.innerHTML = findings
    .map((finding) => {
      const tags = finding.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
      return `
        <article class="finding">
          <div class="finding-header">
            <div>
              <p class="finding-title">${escapeHtml(finding.value)}</p>
              <p class="finding-meta">${escapeHtml(finding.type)} - ${escapeHtml(finding.confidence)} confidence</p>
            </div>
            <span class="tag">${escapeHtml(finding.source)}</span>
          </div>
          ${finding.notes ? `<p class="finding-meta">${escapeHtml(finding.notes)}</p>` : ""}
          <div class="tag-row">${tags}</div>
        </article>
      `;
    })
    .join("");
}

function renderSources(sources) {
  if (!sources.length) {
    elements.sourceList.innerHTML = `<div class="empty-state">No source leads yet.</div>`;
    return;
  }

  elements.sourceList.innerHTML = sources
    .map((source) => `
      <article class="source-card">
        <input type="checkbox" ${source.checked ? "checked" : ""} data-source-id="${source.id}" aria-label="Select source">
        <div>
          <a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>
          <p>${escapeHtml(source.kind)} - ${escapeHtml(source.target)}</p>
        </div>
        <button class="ghost-button compact" type="button" data-open-url="${escapeAttribute(source.url)}">
          <i data-lucide="external-link"></i>
          Open
        </button>
      </article>
    `)
    .join("");

  elements.sourceList.querySelectorAll("[data-open-url]").forEach((button) => {
    button.addEventListener("click", () => window.open(button.dataset.openUrl, "_blank", "noreferrer"));
  });

  elements.sourceList.querySelectorAll("[data-source-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const source = state.lastResult.sources.find((item) => item.id === checkbox.dataset.sourceId);
      if (source) source.checked = checkbox.checked;
    });
  });
}

function renderTranscript(transcriptResult) {
  const container = document.querySelector("#transcriptContent");
  if (!container) return;

  if (!transcriptResult || !transcriptResult.ok) {
    container.innerHTML = `<div class="empty-state">No transcript yet. Paste a YouTube URL and click Run.</div>`;
    return;
  }

  const chunks = transcriptResult.chunks || [];
  const flagged = transcriptResult.flaggedSegments || [];
  const flaggedStarts = new Set(flagged.map((f) => f.start));
  const flaggedReasons = {};
  flagged.forEach((f) => { flaggedReasons[f.start] = f.reason; });

  let html = "";

  if (flagged.length) {
    html += `<div class="section-heading" style="margin-top:0"><h2 style="color:#cc0000">⚠ Flagged Content (${flagged.length})</h2></div>`;
    flagged.forEach((seg) => {
      const m = Math.floor(seg.start / 60);
      const s = Math.floor(seg.start % 60);
      const ts = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
      html += `
        <article class="finding" style="border-left:3px solid #cc0000;background:#fff5f5">
          <div class="finding-header">
            <div>
              <p class="finding-title">[${ts}] ⚠ ${escapeHtml(seg.reason)}</p>
              <p class="finding-meta">Flagged segment</p>
            </div>
            <span class="tag" style="background:#cc0000;color:#fff;border-color:#cc0000">${ts}</span>
          </div>
          <p class="finding-meta">${escapeHtml(seg.text)}</p>
        </article>
      `;
    });
    html += "<hr style='margin:16px 0;border:none;border-top:1px solid #000'>";
  } else {
    html += `<div class="empty-state">No potentially harmful content detected in this transcript.</div><hr style="margin:16px 0;border:none;border-top:1px solid #000">`;
  }

  html += `<div class="section-heading"><h2>Full Transcript</h2></div>`;

  chunks.forEach((chunk, i) => {
    const m = Math.floor(chunk.start / 60);
    const s = Math.floor(chunk.start % 60);
    const ts = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
    const isFlagged = flaggedStarts.has(chunk.start);
    html += `
      <article class="finding"${isFlagged ? ' style="border-left:3px solid #cc0000;background:#fff5f5"' : ""}>
        <div class="finding-header">
          <div>
            <p class="finding-title">[${ts}]${isFlagged ? " ⚠" : ""}</p>
            <p class="finding-meta">Segment ${i + 1} / ${chunks.length} (${chunk.text.length} chars)${isFlagged ? " — " + escapeHtml(flaggedReasons[chunk.start] || "Flagged") : ""}</p>
          </div>
          <span class="tag">${ts}</span>
        </div>
        <p class="finding-meta">${escapeHtml(chunk.text)}</p>
      </article>
    `;
  });

  container.innerHTML = html || `<div class="empty-state">No transcript content.</div>`;
}

async function runOcr() {
  if (!state.uploadedImage) {
    setStatus("Choose a screenshot first.", "warn");
    return;
  }

  setStatus("Loading OCR engine...");
  elements.ocrButton.disabled = true;

  try {
    await ensureTesseract();
    setStatus("Reading screenshot text locally...");
    const result = await Tesseract.recognize(state.uploadedImage, "eng", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          setStatus(`OCR ${Math.round((message.progress || 0) * 100)}%...`);
        }
      }
    });

    const text = result?.data?.text?.trim();
    if (text) {
      elements.rawInput.value = [elements.rawInput.value.trim(), text].filter(Boolean).join("\n\n");
      elements.targetType.value = "screenshot";
      setStatus("OCR text added.");
    } else {
      setStatus("OCR finished, but no text was detected.", "warn");
    }
  } catch {
    setStatus("OCR could not load. Paste the screenshot text manually or check your connection.", "warn");
  } finally {
    elements.ocrButton.disabled = false;
  }
}

function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function setUploadedImage(file) {
  state.uploadedImage = file;
  elements.imagePreview.src = URL.createObjectURL(file);
  elements.previewWrap.classList.remove("hidden");
  setStatus(`Loaded ${file.name}.`);
}

function copyJson() {
  copyText(JSON.stringify(state.lastResult, null, 2), "JSON copied.");
}

function copyReport() {
  copyText(elements.reportOutput.value, "Report copied.");
}

function copyTranscript() {
  const report = state.lastResult.transcriptResult?.report;
  if (report) {
    copyText(report, "Transcript report copied.");
  } else {
    setStatus("No transcript to copy.", "warn");
  }
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch {
    elements.reportOutput.select();
    document.execCommand("copy");
    setStatus(successMessage);
  }
}

function openCheckedSources() {
  state.lastResult.sources
    .filter((source) => source.checked)
    .slice(0, 8)
    .forEach((source) => window.open(source.url, "_blank", "noreferrer"));
}

function resetWorkspace() {
  state.uploadedImage = null;
  state.lastResult = createEmptyResult();
  elements.webInput.value = "";
  elements.rawInput.value = "";
  elements.transcriptInput.value = "";
  elements.imageInput.value = "";
  elements.previewWrap.classList.add("hidden");
  elements.targetType.value = "auto";
  renderResult(state.lastResult);
  setStatus("Ready.");
}

function setStatus(message, tone = "neutral") {
  elements.statusBox.textContent = message;
  elements.statusBox.dataset.tone = tone;
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
