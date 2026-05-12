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
    direct: (h) => `https://www.youtube.com/@${encodeURIComponent(h)}`,
    search: (h) => `https://www.youtube.com/results?search_query=${encodeURIComponent(h)}`
  },
  instagram: {
    label: "Instagram",
    direct: (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${h}"`)}`
  },
  tiktok: {
    label: "TikTok",
    direct: (h) => `https://www.tiktok.com/@${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:tiktok.com "@${h}"`)}`
  },
  x: {
    label: "X",
    direct: (h) => `https://x.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:x.com "${h}"`)}`
  },
  reddit: {
    label: "Reddit",
    direct: (h) => `https://www.reddit.com/user/${encodeURIComponent(h)}/`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:reddit.com "${h}"`)}`
  },
  github: {
    label: "GitHub",
    direct: (h) => `https://github.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:github.com "${h}"`)}`
  },
  twitch: {
    label: "Twitch",
    direct: (h) => `https://www.twitch.tv/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:twitch.tv "${h}"`)}`
  },
  facebook: {
    label: "Facebook",
    direct: (h) => `https://www.facebook.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:facebook.com "${h}"`)}`
  },
  linkedin: {
    label: "LinkedIn",
    direct: (h) => `https://www.linkedin.com/in/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${h}"`)}`
  },
  snapchat: {
    label: "Snapchat",
    direct: (h) => `https://www.snapchat.com/add/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`snapchat "${h}"`)}`
  },
  telegram: {
    label: "Telegram",
    direct: (h) => `https://t.me/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:t.me "${h}"`)}`
  },
  discord: {
    label: "Discord",
    direct: (h) => `https://discord.com/users/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`discord "${h}"`)}`
  },
  whatsapp: {
    label: "WhatsApp",
    direct: () => null,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`whatsapp "${h}"`)}`
  },
  signal: {
    label: "Signal",
    direct: () => null,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`signal "${h}"`)}`
  },
  pinterest: {
    label: "Pinterest",
    direct: (h) => `https://www.pinterest.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:pinterest.com "${h}"`)}`
  },
  tumblr: {
    label: "Tumblr",
    direct: (h) => `https://${encodeURIComponent(h)}.tumblr.com`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:tumblr.com "${h}"`)}`
  },
  medium: {
    label: "Medium",
    direct: (h) => `https://medium.com/@${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:medium.com "@${h}"`)}`
  },
  soundcloud: {
    label: "SoundCloud",
    direct: (h) => `https://soundcloud.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:soundcloud.com "${h}"`)}`
  },
  patreon: {
    label: "Patreon",
    direct: (h) => `https://www.patreon.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:patreon.com "${h}"`)}`
  },
  onlyfans: {
    label: "OnlyFans",
    direct: (h) => `https://onlyfans.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:onlyfans.com "${h}"`)}`
  },
  threads: {
    label: "Threads",
    direct: (h) => `https://www.threads.net/@${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:threads.net "${h}"`)}`
  },
  bluesky: {
    label: "Bluesky",
    direct: (h) => `https://bsky.app/profile/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:bsky.app "${h}"`)}`
  },
  telegram_channel: {
    label: "Telegram Channel",
    direct: (h) => `https://t.me/s/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`t.me/${h}`)}`
  },
  mastodon: {
    label: "Mastodon",
    direct: (h) => {
      const parts = h.split("@");
      if (parts.length === 2 && parts[1].includes(".")) return `https://${parts[1]}/@${parts[0]}`;
      return null;
    },
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:mastodon.social "@${h}" OR site:mastodon.world "@${h}"`)}`
  },
  spotify: {
    label: "Spotify",
    direct: (h) => `https://open.spotify.com/user/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:open.spotify.com/user "${h}"`)}`
  },
  vk: {
    label: "VK",
    direct: (h) => `https://vk.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:vk.com "${h}"`)}`
  },
  weibo: {
    label: "Weibo",
    direct: (h) => `https://weibo.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:weibo.com "${h}"`)}`
  },
  substack: {
    label: "Substack",
    direct: (h) => `https://${encodeURIComponent(h)}.substack.com`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:substack.com "${h}"`)}`
  },
  cashapp: {
    label: "Cash App",
    direct: (h) => `https://cash.app/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`cash.app "${h}" OR "cashapp" "${h}"`)}`
  },
  venmo: {
    label: "Venmo",
    direct: (h) => `https://venmo.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:venmo.com "${h}"`)}`
  },
  paypal: {
    label: "PayPal",
    direct: (h) => `https://www.paypal.com/paypalme/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:paypal.com/paypalme "${h}"`)}`
  },
  ebay: {
    label: "eBay",
    direct: (h) => `https://www.ebay.com/usr/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:ebay.com "${h}"`)}`
  },
  etsy: {
    label: "Etsy",
    direct: (h) => `https://www.etsy.com/shop/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:etsy.com "${h}"`)}`
  },
  fiverr: {
    label: "Fiverr",
    direct: (h) => `https://www.fiverr.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:fiverr.com "${h}"`)}`
  },
  upwork: {
    label: "Upwork",
    direct: (h) => `https://www.upwork.com/freelancers/~${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:upwork.com "${h}"`)}`
  },
  wordpress: {
    label: "WordPress",
    direct: (h) => `https://${encodeURIComponent(h)}.wordpress.com`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:wordpress.com "${h}"`)}`
  },
  blogspot: {
    label: "Blogger",
    direct: (h) => `https://${encodeURIComponent(h)}.blogspot.com`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:blogspot.com "${h}"`)}`
  },
  deviantart: {
    label: "DeviantArt",
    direct: (h) => `https://www.deviantart.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:deviantart.com "${h}"`)}`
  },
  artstation: {
    label: "ArtStation",
    direct: (h) => `https://www.artstation.com/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:artstation.com "${h}"`)}`
  },
  strava: {
    label: "Strava",
    direct: (h) => `https://www.strava.com/athletes/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:strava.com "${h}"`)}`
  },
  aboutme: {
    label: "about.me",
    direct: (h) => `https://about.me/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:about.me "${h}"`)}`
  },
  keybase: {
    label: "Keybase",
    direct: (h) => `https://keybase.io/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:keybase.io "${h}"`)}`
  },
  hackernews: {
    label: "Hacker News",
    direct: (h) => `https://news.ycombinator.com/user?id=${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:news.ycombinator.com "${h}"`)}`
  },
  producthunt: {
    label: "Product Hunt",
    direct: (h) => `https://www.producthunt.com/@${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:producthunt.com "${h}"`)}`
  },
  angellist: {
    label: "AngelList",
    direct: (h) => `https://angel.co/u/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:angel.co "${h}"`)}`
  },
  steam: {
    label: "Steam",
    direct: (h) => `https://steamcommunity.com/id/${encodeURIComponent(h)}`,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`site:steamcommunity.com "${h}"`)}`
  },
  matrix: {
    label: "Matrix",
    direct: () => null,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`matrix "${h}"`)}`
  },
  slack: {
    label: "Slack",
    direct: () => null,
    search: (h) => `https://www.google.com/search?q=${encodeURIComponent(`slack "${h}"`)}`
  }
};

const elements = {
  modeButtons: document.querySelectorAll(".mode-button"),
  webGrabPanel: document.querySelector("#webGrabPanel"),
  osintPanel: document.querySelector("#osintPanel"),
  transcriptPanel: document.querySelector("#transcriptPanel"),
  transcriptInput: document.querySelector("#transcriptInput"),
  webInput: document.querySelector("#webInput"),

  rawInput: document.querySelector("#rawInput"),
  imageInput: document.querySelector("#imageInput"),
  dropZone: document.querySelector("#dropZone"),
  ocrButton: document.querySelector("#ocrButton"),
  previewWrap: document.querySelector("#previewWrap"),
  imagePreview: document.querySelector("#imagePreview"),

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
  const imgSearchBtn = document.querySelector("#imageSearchButton");
  const faceSearchBtn = document.querySelector("#faceSearchButton");
  if (imgSearchBtn) imgSearchBtn.addEventListener("click", () => runImageSearch("google"));
  if (faceSearchBtn) faceSearchBtn.addEventListener("click", () => runImageSearch("face"));
  elements.copyJsonButton.addEventListener("click", copyJson);
  elements.copyReportButton.addEventListener("click", copyReport);
  elements.copyTranscriptButton.addEventListener("click", copyTranscript);
  elements.openAllButton.addEventListener("click", openCheckedSources);
  window.addEventListener("online", () => { if (!state.connection.online) updateConnectionStatus(true); });
  window.addEventListener("offline", () => {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
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
  if (mode === "web") setStatus("Paste website links above and click Run.");
  else if (mode === "transcript") setStatus("Paste a YouTube link above and click Run.");
  else setStatus("Paste names or links above and click Run.");
}

async function updateConnectionStatus(force = false) {
  if (!navigator.onLine) {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
    return false;
  }

  try {
    const response = await fetch(`/api/connection${force ? "?force=1" : ""}`, { cache: "no-store" });
    const payload = await response.json();
    const online = response.ok && payload.online;
    state.connection = { ...payload, online };
    return online;
  } catch {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
    return false;
  }
}

async function ensureOnlineConnection() {
  if (!navigator.onLine) {
    state.connection = { online: false, checkedAt: new Date().toISOString() };
    return false;
  }
  const checkedAt = state.connection.checkedAt ? new Date(state.connection.checkedAt).getTime() : 0;
  if (state.connection.online && Date.now() - checkedAt < 30000) return true;
  return updateConnectionStatus(true);
}

function createEmptyResult() {
  return {
    createdAt: new Date().toISOString(),
    findings: [],
    sources: [],
    flags: [],
    summary: "Paste something above and click Run to start.",
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
  const rawText = elements.webInput.value.trim();
  if (!rawText) {
    setStatus("Add at least one website link.", "warn");
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
    addFlag(result, "warn", "No links found. Search results created instead.");
    addBaselineFlags(result);
    result.summary = buildSummary(result);
    result.report = buildReport(result);
    state.lastResult = result;
    renderResult(result);
    setStatus("Created search results. Add website links to get page content.", "warn");
    return;
  }

  const canCollectOnline = await ensureOnlineConnection();
  if (!canCollectOnline) {
    setStatus("Need internet to get pages.", "warn");
    return;
  }

  setStatus("Getting website content...");

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

    setStatus(`Got ${grabbedPages.length} page${grabbedPages.length === 1 ? "" : "s"}.`);
  } catch {
    setStatus("Failed to get pages.", "warn");
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
  const url = elements.transcriptInput.value.trim();
  if (!url) {
    setStatus("Paste a YouTube link first.", "warn");
    return;
  }

  const canCollectOnline = await ensureOnlineConnection();
  if (!canCollectOnline) {
    setStatus("Need internet to get transcript.", "warn");
    return;
  }

  setStatus("Getting transcript...");
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
      if (data.violationAnalysis?.category) {
        addFinding(result, {
          type: "YouTube Content Violation",
          value: `Category: ${data.violationAnalysis.category}`,
          confidence: "medium",
          source: `https://www.youtube.com/watch?v=${data.videoId}`,
          notes: data.flaggedSegments?.length
            ? `${data.flaggedSegments.length} flagged segment(s)`
            : "Pattern match in metadata",
          tags: ["youtube", "transcript", "violation"]
        });
        addFlag(result, "danger", `[${data.violationAnalysis.category}] Violation analysis triggered`);
      }
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
          const ts = fmtTime(seg.start);
          const txt = seg.text || "";
          const displayText = txt.length > 160 ? txt.slice(0, txt.lastIndexOf(" ", 160)) + "..." : txt;
          addFlag(result, "danger", `[${ts}] ${seg.reason}: "${displayText}"`);
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
      ? `Transcript done: ${data.chunkCount} parts, ${data.wordCount} words.`
      : `Transcript failed: ${data.error}`);
  } catch {
    setStatus("Transcript failed.", "warn");
  } finally {
    elements.runButton.disabled = false;
  }
}

async function runOsintCollection() {
  const rawText = elements.rawInput.value.trim();
  if (!rawText && !state.uploadedImage) {
    setStatus("Paste a name, link, or photo first.", "warn");
    return;
  }

  setStatus("Looking up info...");
  const result = analyzeInput(rawText, "auto");
  state.lastResult = result;
  renderResult(result);

  const canCollectOnline = await ensureOnlineConnection();
  if (canCollectOnline) {
    await enrichYouTubeFindings(result);
    await enrichPublicSourceMetadata(result);
    await verifyProfiles(result);
  }

  renderResult(result);
  const verifiedCount = result.sources.filter((s) => s.verified).length;
  const msg = `Done: ${result.findings.length} result${result.findings.length === 1 ? "" : "s"}, ${result.sources.length} link${result.sources.length === 1 ? "" : "s"}.`;
  setStatus(verifiedCount ? `${msg} ${verifiedCount} account${verifiedCount > 1 ? "s" : ""} found.` : msg);
}

function analyzeInput(rawText, selectedType) {
  const result = createEmptyResult();
  result.rawText = rawText;

  const urls = extractUrls(rawText);
  const handles = extractHandles(rawText);
  const emails = extractEmails(rawText);
  const phoneMatches = extractPossiblePhones(rawText);
  const dates = extractDates(rawText);
  const ips = extractIPs(rawText);
  const crypto = extractCryptoAddresses(rawText);
  const discordInvites = extractDiscordInvites(rawText);
  const userAgents = extractUserAgents(rawText);
  const macAddresses = extractMAC(rawText);
  const coordinates = extractCoordinates(rawText);
  const creditCards = extractCreditCards(rawText);
  const ssns = extractSSN(rawText);
  const postalCodes = extractPostalCodes(rawText);

  urls.forEach((url) => addUrlFinding(result, url));
  handles.forEach((handle) => addHandleFinding(result, handle, selectedType));

  if (selectedType === "auto") {
    const inferred = inferSingleHandle(rawText);
    inferred.forEach((handle) => {
      const exists = handles.some((h) => cleanHandle(h) === handle);
      if (!exists) addHandleFinding(result, handle, "generic");
    });
  }

  emails.forEach((email) => {
    addFinding(result, {
      type: "Email address",
      value: email,
      confidence: "high",
      source: "Input text",
      notes: "Email detected. Verify it is public before including in reports.",
      tags: ["sensitive", "email"]
    });
  });

  if (phoneMatches.length) {
    addFinding(result, {
      type: "Phone number",
      value: phoneMatches.join(", "),
      confidence: "medium",
      source: "Input text",
      notes: `${phoneMatches.length} possible phone number(s) found. Handle with care.`,
      tags: ["sensitive", "phone"]
    });
  }

  if (ips.length) {
    const ipv4Count = ips.filter((ip) => ip.includes(".")).length;
    const ipv6Count = ips.length - ipv4Count;
    addFinding(result, {
      type: "IP address",
      value: ips.join(", "),
      confidence: "medium",
      source: "Input text",
      notes: `${ipv4Count} IPv4, ${ipv6Count} IPv6 address(es) detected. May indicate server origin or VPN.`,
      tags: ["network", "ip"]
    });
  }

  // Crypto - count all types
  const cryptoTypes = [];
  if (crypto.btc.length) cryptoTypes.push(`${crypto.btc.length} BTC`);
  if (crypto.eth.length) cryptoTypes.push(`${crypto.eth.length} ETH`);
  if (crypto.usdt.length) cryptoTypes.push(`${crypto.usdt.length} USDT`);
  if (crypto.ltc.length) cryptoTypes.push(`${crypto.ltc.length} LTC`);
  if (crypto.xrp.length) cryptoTypes.push(`${crypto.xrp.length} XRP`);
  if (crypto.bch.length) cryptoTypes.push(`${crypto.bch.length} BCH`);
  if (crypto.xmr.length) cryptoTypes.push(`${crypto.xmr.length} XMR`);
  if (crypto.ada.length) cryptoTypes.push(`${crypto.ada.length} ADA`);
  if (crypto.doge.length) cryptoTypes.push(`${crypto.doge.length} DOGE`);
  if (crypto.sol.length) cryptoTypes.push(`${crypto.sol.length} SOL`);
  if (crypto.ens.length) cryptoTypes.push(`${crypto.ens.length} ENS`);

  const allCrypto = [...crypto.btc, ...crypto.eth, ...crypto.usdt, ...crypto.ltc, ...crypto.xrp, ...crypto.bch, ...crypto.xmr, ...crypto.ada, ...crypto.doge, ...crypto.sol, ...crypto.ens];
  if (allCrypto.length) {
    addFinding(result, {
      type: "Cryptocurrency address",
      value: allCrypto.join(", "),
      confidence: "medium",
      source: "Input text",
      notes: cryptoTypes.join(", ") + " found. Financial leads — verify independently.",
      tags: ["crypto", "financial"]
    });
  }

  if (discordInvites.length) {
    addFinding(result, {
      type: "Discord invite",
      value: discordInvites.join(", "),
      confidence: "high",
      source: "Input text",
      notes: "Discord server invite link(s) detected.",
      tags: ["social", "discord"]
    });
  }

  if (macAddresses.length) {
    addFinding(result, {
      type: "MAC address",
      value: macAddresses.join(", "),
      confidence: "high",
      source: "Input text",
      notes: "Network hardware identifier detected.",
      tags: ["network", "mac"]
    });
  }

  if (coordinates.length) {
    addFinding(result, {
      type: "GPS coordinate",
      value: coordinates.join(", "),
      confidence: "medium",
      source: "Input text",
      notes: "Geographic coordinates — may indicate location.",
      tags: ["sensitive", "location"]
    });
  }

  if (creditCards.length) {
    addFinding(result, {
      type: "Payment card",
      value: creditCards.join(", "),
      confidence: "medium",
      source: "Input text",
      notes: `${creditCards.length} possible payment card number(s). HIGHLY SENSITIVE — verify and redact immediately.`,
      tags: ["sensitive", "financial", "pii"]
    });
    addFlag(result, "danger", "Payment card number(s) detected. HIGHLY SENSITIVE — redact and do not republish.");
  }

  if (ssns.length) {
    addFinding(result, {
      type: "SSN / Tax ID",
      value: ssns.join(", "),
      confidence: "medium",
      source: "Input text",
      notes: `${ssns.length} possible SSN(s) detected. HIGHLY SENSITIVE — verify and redact immediately.`,
      tags: ["sensitive", "pii"]
    });
    addFlag(result, "danger", "Social Security / Tax ID number(s) detected. HIGHLY SENSITIVE — redact and do not republish.");
  }

  if (userAgents.length) {
    addFinding(result, {
      type: "User-agent string",
      value: userAgents.join(", ").slice(0, 200),
      confidence: "high",
      source: "Input text",
      notes: `${userAgents.length} user-agent string(s). Indicates browser/device fingerprint.`,
      tags: ["technical", "fingerprint"]
    });
  }

  if (postalCodes.length) {
    addFinding(result, {
      type: "Postal / ZIP code",
      value: postalCodes.join(", "),
      confidence: "medium",
      source: "Input text",
      notes: "Geographic area identifier(s).",
      tags: ["location"]
    });
  }

  if (dates.length) {
    addFinding(result, {
      type: "Timeline clue",
      value: dates.join(", "),
      confidence: "low",
      source: "Input text",
      notes: "Dates or timestamps. Verify against original context.",
      tags: ["timeline"]
    });
  }

  if (!result.findings.length && rawText) {
    addFinding(result, {
      type: "Unstructured text",
      value: rawText.slice(0, 200),
      confidence: "low",
      source: "Input text",
      notes: "No handle or URL detected. Manual review recommended.",
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
      const directUrl = platform.direct(handle);
      if (directUrl) {
        const exists = result.sources.some((source) => source.url === directUrl);
        if (!exists) {
          addSource(result, {
            title: `${platform.label} same-handle lead`,
            url: directUrl,
            kind: "Cross-platform",
            target: `@${handle}`,
            checked: false
          });
        }
      }
      const searchUrl = platform.search(handle);
      const exists = result.sources.some((source) => source.url === searchUrl);
      if (!exists) {
        addSource(result, {
          title: `${platform.label} search`,
          url: searchUrl,
          kind: "Cross-platform search",
          target: `@${handle}`,
          checked: false
        });
      }
    });

    // Google exact phrase search
    addSource(result, {
      title: "Exact phrase web search",
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${handle}"`)}`,
      kind: "Search",
      target: `@${handle}`,
      checked: false
    });

    // Username aggregator: WhatsMyName
    addSource(result, {
      title: "Username search (WhatsMyName)",
      url: `https://whatsmyname.app/?q=${encodeURIComponent(handle)}`,
      kind: "Aggregator",
      target: `@${handle}`,
      checked: false
    });

    // Username aggregator: Namechk
    addSource(result, {
      title: "Username search (Namechk)",
      url: `https://namechk.com/?q=${encodeURIComponent(handle)}`,
      kind: "Aggregator",
      target: `@${handle}`,
      checked: false
    });

    // Sherlock-style GitHub username search
    addSource(result, {
      title: "Username GitHub search",
      url: `https://github.com/search?q=${encodeURIComponent(handle)}+in%3Alogin&type=Users`,
      kind: "Aggregator search",
      target: `@${handle}`,
      checked: false
    });

    // Social Searcher
    addSource(result, {
      title: "Social Searcher (cross-platform)",
      url: `https://www.social-searcher.com/google-social-search/?q=${encodeURIComponent(handle)}`,
      kind: "Aggregator search",
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

  setStatus("Checking YouTube info...");

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
    setStatus(`Checking info ${index + 1}/${metadataTargets.length}...`);

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

async function verifyProfiles(result) {
  const profileUrls = unique(
    result.sources
      .filter((s) => s.kind === "Profile" || s.kind === "Direct" || s.kind === "Cross-platform")
      .filter((s) => {
        try {
          const host = new URL(s.url).hostname;
          return !host.includes("google.com") && !host.includes("whatsmyname") && !host.includes("namechk") && !host.includes("social-searcher") && !host.includes("github.com/search");
        } catch { return false; }
      })
      .map((s) => s.url)
  ).slice(0, 25);

  if (!profileUrls.length) return;

    setStatus(`Checking ${profileUrls.length} account${profileUrls.length === 1 ? "" : "s"}...`);

  try {
    const response = await fetch("/api/verify-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: profileUrls })
    });
    const data = await response.json();
    if (!data.ok || !data.results) return;

    const verifiedUrls = new Map();
    data.results.forEach((r) => {
      verifiedUrls.set(r.url, r.exists);
      if (r.finalUrl && r.finalUrl !== r.url) verifiedUrls.set(r.finalUrl, r.exists);
    });

    let verifiedCount = 0;
    let unverifiedCount = 0;

    result.sources.forEach((source) => {
      const exists = verifiedUrls.get(source.url);
      if (exists === true) {
        source.verified = true;
        source.checked = true;
        verifiedCount++;
      } else if (exists === false) {
        source.verified = false;
        unverifiedCount++;
      }
    });

    // Add verified account findings
    data.results.forEach((r) => {
      if (r.exists) {
        try {
          const host = new URL(r.url).hostname.replace(/^www\./, "");
          addFinding(result, {
            type: "Verified account",
            value: r.url,
            confidence: "high",
            source: r.url,
            notes: `Account confirmed existing on ${host} (HTTP ${r.status})`,
            tags: ["verified", "confirmed"]
          });
        } catch {}
      }
    });

    const totalChecked = data.results.filter((r) => r.checked).length;
    if (verifiedCount > 0) {
      addFlag(result, "info", `${verifiedCount} account${verifiedCount > 1 ? "s" : ""} found and confirmed.`);
    }
    if (unverifiedCount > 0) {
      addFlag(result, "warn", `${unverifiedCount} account${unverifiedCount > 1 ? "s" : ""} not confirmed (may not exist or need login).`);
    }

    result.summary = buildSummary(result);
    result.report = buildReport(result);
  } catch {
    // Silently skip if verification fails
  }
}

function extractUrls(text) {
  const patterns = [
    /\bhttps?:\/\/[^\s<>"'\]]+/gi,
    /\bhttps?:\/\/[^\s()<>"']+(?:\([^\s()<>"']*\)[^\s()<>"']*)*/gi
  ];
  const all = [];
  patterns.forEach((p) => {
    const m = text.match(p);
    if (m) all.push(...m);
  });
  return unique(
    all.map((url) =>
      url
        .replace(/[),.;:!?]+$/g, "")
        .replace(/[([{]$/, "")
        .replace(/#.*$/, "")
        .replace(/\]$/, "")
    )
  );
}

function extractHandles(text) {
  const explicitHandles = text.match(/(^|[^\w@])@([\w.-]{2,30})/g) || [];
  const fromUrls = extractUrls(text).map(extractHandleFromUrl).filter(Boolean);
  const all = [
    ...explicitHandles.map((match) => match.replace(/[^\w@.-]/g, "")),
    ...fromUrls
  ];
  return unique(all);
}

function extractHandleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (host.includes("youtube.com") || host === "youtu.be") return parts[0]?.startsWith("@") ? parts[0] : (parts[1] === "channel" && parts[2] ? parts[2] : parts[0]?.startsWith("@") ? parts[0] : "");
    if (host.includes("instagram.com")) return parts[0]?.startsWith("@") ? parts[0].slice(1) : parts[0];
    if (host.includes("tiktok.com")) return parts[0]?.startsWith("@") ? parts[0].replace("@","") : parts[0];
    if (host === "x.com" || host.includes("twitter.com")) return parts[0] || "";
    if (host.includes("reddit.com")) return parts[0] === "user" ? parts[1] : parts[0]?.startsWith("u/") ? parts[0].slice(2) : parts[0]?.startsWith("/u/") ? parts[0].slice(3) : "";
    if (host.includes("github.com") || host === "git.io") return parts[0] || "";
    if (host.includes("twitch.tv")) return parts[0] || "";
    if (host.includes("facebook.com") || host === "fb.com") return parts[0] || "";
    if (host.includes("linkedin.com")) return parts[1] === "in" ? parts[2] : (parts[0] === "in" ? parts[1] : parts[0]);
    if (host.includes("snapchat.com")) return parts[0] === "add" ? parts[1] : parts[0];
    if (host === "t.me" || host.includes("telegram.org") || host === "telegram.me" || host === "telegram.dog") return parts[0] || "";
    if (host.includes("pinterest")) return parts[0] || "";
    if (host.includes("tumblr.com")) return parts[0] || host.replace(".tumblr.com", "");
    if (host.includes("medium.com")) return parts[0]?.startsWith("@") ? parts[0].slice(1) : parts[0];
    if (host.includes("soundcloud.com")) return parts[0] || "";
    if (host.includes("patreon.com")) return parts[0] || "";
    if (host.includes("onlyfans.com")) return parts[0] || "";
    if (host.includes("threads.net")) return parts[0]?.startsWith("@") ? parts[0].slice(1) : parts[0];
    if (host === "bsky.app") return parts[1] === "profile" ? parts[2] : "";
    if (host.includes("behance.net")) return parts[0] || "";
    if (host.includes("dribbble.com")) return parts[0] || "";
    if (host.includes("flickr.com")) return parts[0] === "people" ? parts[1] : parts[0];
    if (host.includes("vimeo.com")) return parts[0] || "";
    if (host.includes("codepen.io")) return parts[0] || "";
    if (host.includes("keybase.io")) return parts[0] || "";
    if (host.includes("about.me")) return parts[0] || "";
    if (host.includes("angel.co") || host.includes("angellist.com")) return parts[0] || "";
    if (host.includes("producthunt.com")) return parts[0] === "profile" ? parts[1] : parts[0]?.startsWith("@") ? parts[0].slice(1) : "";
    if (host.includes("discord.com") || host.includes("discord.gg") || host.includes("discord.me")) return host.includes("invite") ? parts[1] : "";
    if (host.includes("steamcommunity.com")) return parts[0] === "id" ? parts[1] : (parts[1] === "profiles" ? parts[2] : "");
    if (host.includes("mastodon.social") || host.includes("mastodon.world") || host.includes("mastodon.")) return parts[0]?.startsWith("@") ? parts[0].slice(1) : parts[0];
    if (host.includes("vk.com")) return parts[0] || "";
    if (host.includes("weibo.com")) return parts[0] || "";
    if (host.includes("substack.com")) return host.replace(".substack.com", "") || parts[0];
    if (host.includes("cash.app")) return parts[0] || "";
    if (host.includes("venmo.com")) return parts[0] || "";
    if (host.includes("paypal.com") && parts[0] === "paypalme") return parts[1] || "";
    if (host.includes("ebay.com") && parts[0] === "usr") return parts[1] || "";
    if (host.includes("etsy.com") && parts[0] === "shop") return parts[1] || "";
    if (host.includes("fiverr.com")) return parts[0] || "";
    if (host.includes("upwork.com")) return parts[0] === "freelancers" ? parts[1]?.replace(/^~/, "") : "";
    if (host.includes("wordpress.com")) return host.replace(".wordpress.com", "") || "";
    if (host.includes("blogspot.com")) return host.replace(".blogspot.com", "") || "";
    if (host.includes("deviantart.com")) return parts[0] || "";
    if (host.includes("artstation.com")) return parts[0] || "";
    if (host.includes("strava.com") && parts[0] === "athletes") return parts[1] || "";
    if (host.includes("news.ycombinator.com")) return "";
    if (host.includes("spotify.com") && parts[0] === "user") return parts[1] || "";
  } catch { return ""; }
  return "";
}

function extractEmails(text) {
  return unique(text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []);
}

function extractPossiblePhones(text) {
  const patterns = [
    // US/CA: +1 (555) 123-4567 or 555-123-4567
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g,
    // International: +CC X... with country code 1-3 digits, then 6-14 digits
    /\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]\d{1,5})?/g,
    // Label-prefixed: tel/phone/cell/mobile/call/whatsapp/viber + digits
    /(?:tel|phone|cell|mobile|call|whatsapp|viber|telegram|line|skype|text|dial|reach|contact)[:\s]*\+?[\d\s().-]{7,18}/gi,
    // UK-style: 07XXX XXXXXX
    /\b07\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
    // AU-style: 04XX XXX XXX
    /\b04\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
    // Generic: standalone groups of 10-15 digits with optional spacing
    /(?<!\d)(?:\d[\s.-]?){9,14}(?!\d)/g
  ];
  const all = [];
  patterns.forEach((p) => { const m = text.match(p); if (m) all.push(...m); });
  const filtered = all.filter((v) => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  });
  return unique(filtered);
}

function extractDates(text) {
  const patterns = [
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember|t)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s*\d{4})?\b/gi,
    /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi,
    /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g,
    /\b(?:yesterday|today|tomorrow|last\s+\w+|next\s+\w+)\b/gi,
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\b/gi
  ];
  const all = [];
  patterns.forEach((p) => { const m = text.match(p); if (m) all.push(...m); });
  return unique(all);
}

function extractIPs(text) {
  // IPv4 with octet validation
  const ipv4 = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  const validv4 = ipv4.filter((ip) => ip.split(".").every((o) => Number(o) >= 0 && Number(o) <= 255));

  // IPv6 (simplified - matches common formats)
  const ipv6Pattern = /\b(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}\b|\b(?:[a-fA-F0-9]{1,4}:){1,7}:|\b(?:[a-fA-F0-9]{1,4}:){1,6}:[a-fA-F0-9]{1,4}\b|\b::(?:[a-fA-F0-9]{1,4}:){1,6}[a-fA-F0-9]{1,4}\b|\b(?:[a-fA-F0-9]{1,4}:){1,5}(?::[a-fA-F0-9]{1,4}){1,2}\b|\b(?:[a-fA-F0-9]{1,4}:){1,4}(?::[a-fA-F0-9]{1,4}){1,3}\b|\b(?:[a-fA-F0-9]{1,4}:){1,3}(?::[a-fA-F0-9]{1,4}){1,4}\b|\b(?:[a-fA-F0-9]{1,4}:){1,2}(?::[a-fA-F0-9]{1,4}){1,5}\b|\b[a-fA-F0-9]{1,4}:(?::[a-fA-F0-9]{1,4}){1,6}\b/g;
  const ipv6Matches = text.match(ipv6Pattern) || [];

  return unique([...validv4, ...ipv6Matches]);
}

function extractCryptoAddresses(text) {
  // Bitcoin - legacy (1), segwit (3), bech32 (bc1)
  const btc = text.match(/\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g) || [];
  const bc1 = text.match(/\bbc1[a-zA-HJ-NP-Z0-9]{25,58}\b/g) || [];
  // Ethereum (0x + 40 hex)
  const eth = text.match(/\b0x[a-fA-F0-9]{40}\b/g) || [];
  // Tether TRC20 (T + 33 base58)
  const usdt = text.match(/\bT[A-HJ-NP-Za-km-z1-9]{33}\b/g) || [];
  // Litecoin (L + 26-33 base58)
  const ltc = text.match(/\b[LM][a-km-zA-HJ-NP-Z1-9]{26,33}\b/g) || [];
  // XRP (r + 24-34 base58)
  const xrp = text.match(/\br[a-zA-HJ-NP-Z0-9]{24,34}\b/g) || [];
  // Bitcoin Cash (q or p prefix)
  const bch = text.match(/\b[qp][a-zA-HJ-NP-Z0-9]{25,50}\b/g) || [];
  // Monero (4 or 8 prefix, 95 chars)
  const xmr = text.match(/\b[48][0-9a-zA-Z]{94}\b/g) || [];
  // Cardano (starts with addr1)
  const ada = text.match(/\baddr1[a-zA-HJ-NP-Z0-9]{40,60}\b/g) || [];
  // Dogecoin (D prefix)
  const doge = text.match(/\bD[a-km-zA-HJ-NP-Z1-9]{25,34}\b/g) || [];
  // Solana (32-44 base58)
  const sol = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [];
  // Blockchain ENS domains (algo.eth-style patterns)
  const ens = text.match(/\b\w+\.eth\b/g) || [];
  return {
    btc: unique([...btc, ...bc1]),
    eth: unique(eth),
    usdt: unique(usdt),
    ltc: unique(ltc),
    xrp: unique(xrp),
    bch: unique(bch),
    xmr: unique(xmr),
    ada: unique(ada),
    doge: unique(doge),
    sol: unique(sol.filter((s) => !/^(?:https?:\/\/)/i.test(s) && s.length >= 32)),
    ens: unique(ens)
  };
}

function extractDiscordInvites(text) {
  const codes = text.match(/(?:discord\.(?:gg|me|io|com\/invite)\/)([a-zA-Z0-9_-]+)/g) || [];
  return unique(codes);
}

function extractUserAgents(text) {
  const ua = text.match(/[A-Za-z0-9]+\/[0-9]+\.[0-9]+(?:\.[0-9]+)?\s*\([^)]+\)\s*(?:[A-Za-z0-9/]+(?:\s+[A-Za-z0-9/]+)*)?/g) || [];
  return unique(ua);
}

function extractMAC(text) {
  const macs = text.match(/\b(?:[a-fA-F0-9]{2}[:-]){5}[a-fA-F0-9]{2}\b/g) || [];
  return unique(macs);
}

function extractCoordinates(text) {
  const results = [];
  // Decimal: 40.7128, -74.0060 or 40.7128° N, 74.0060° W
  const decPattern = /(-?\d{1,2}\.\d{4,})\s*[,°]?\s*(?:N|S|North|South)?,?\s*(-?\d{1,3}\.\d{4,})\s*[,°]?\s*(?:E|W|East|West)?/gi;
  let m;
  while ((m = decPattern.exec(text)) !== null) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      results.push(`${m[1]}, ${m[2]}`);
    }
  }
  // DMS: 40°42'46"N 74°00'21"W
  const dmsPattern = /(\d{1,3})°\s*(\d{1,2})'[,\s]*(\d{1,2}(?:\.\d+)?)"?\s*([NSEWnsew])/g;
  while ((m = dmsPattern.exec(text)) !== null) {
    results.push(`${m[1]}°${m[2]}'${m[3]}"${m[4]}`);
  }
  return unique(results);
}

function extractCreditCards(text) {
  const ccPatterns = [
    /\b4\d{3}[\s.-]?\d{4}[\s.-]?\d{4}[\s.-]?\d{4}\b/g,         // Visa
    /\b5[1-5]\d{2}[\s.-]?\d{4}[\s.-]?\d{4}[\s.-]?\d{4}\b/g,     // Mastercard
    /\b3[47]\d{2}[\s.-]?\d{6}[\s.-]?\d{5}\b/g,                   // Amex
    /\b6(?:011|5\d{2})\d{2}[\s.-]?\d{4}[\s.-]?\d{4}[\s.-]?\d{4}\b/g // Discover
  ];
  const all = [];
  ccPatterns.forEach((p) => { const m = text.match(p); if (m) all.push(...m); });
  return unique(all);
}

function extractSSN(text) {
  const ssn = text.match(/\b(?!000|666|9\d{2})\d{3}[-]?(?!00)\d{2}[-]?(?!0000)\d{4}\b/g) || [];
  return unique(ssn);
}

function extractPostalCodes(text) {
  const results = [];
  // US ZIP+4 or ZIP
  const usZip = text.match(/\b\d{5}(?:-\d{4})?\b/g) || [];
  // UK Postcodes
  const ukPost = text.match(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/g) || [];
  // Canadian postal codes
  const caPost = text.match(/\b[ABCEGHJKLMNPRSTVXY]\d[A-Z]\s?\d[A-Z]\d\b/gi) || [];
  return unique([...usZip, ...ukPost, ...caPost]);
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
    if (host === "x.com" || host.includes("twitter.com")) return { key: "x", label: "X/Twitter" };
    if (host.includes("reddit.com")) return { key: "reddit", label: "Reddit" };
    if (host.includes("github.com") || host === "git.io") return { key: "github", label: "GitHub" };
    if (host.includes("twitch.tv")) return { key: "twitch", label: "Twitch" };
    if (host.includes("facebook.com") || host === "fb.com") return { key: "facebook", label: "Facebook" };
    if (host.includes("linkedin.com")) return { key: "linkedin", label: "LinkedIn" };
    if (host.includes("snapchat.com")) return { key: "snapchat", label: "Snapchat" };
    if (host === "t.me" || host.includes("telegram") || host === "telegram.me" || host === "telegram.dog") return { key: "telegram", label: "Telegram" };
    if (host.includes("discord.com") || host.includes("discord.gg") || host.includes("discord.me")) return { key: "discord", label: "Discord" };
    if (host.includes("pinterest")) return { key: "pinterest", label: "Pinterest" };
    if (host.includes("tumblr.com")) return { key: "tumblr", label: "Tumblr" };
    if (host.includes("medium.com")) return { key: "medium", label: "Medium" };
    if (host.includes("soundcloud.com")) return { key: "soundcloud", label: "SoundCloud" };
    if (host.includes("patreon.com")) return { key: "patreon", label: "Patreon" };
    if (host.includes("onlyfans.com")) return { key: "onlyfans", label: "OnlyFans" };
    if (host.includes("threads.net")) return { key: "threads", label: "Threads" };
    if (host === "bsky.app") return { key: "bluesky", label: "Bluesky" };
    if (host.includes("whatsapp.com")) return { key: "whatsapp", label: "WhatsApp" };
    if (host.includes("signal.org") || host.includes("signal.me")) return { key: "signal", label: "Signal" };
    if (host.includes("behance.net")) return { key: "web", label: "Behance" };
    if (host.includes("dribbble.com")) return { key: "web", label: "Dribbble" };
    if (host.includes("flickr.com")) return { key: "web", label: "Flickr" };
    if (host.includes("vimeo.com")) return { key: "web", label: "Vimeo" };
    if (host.includes("codepen.io")) return { key: "web", label: "CodePen" };
    if (host.includes("keybase.io")) return { key: "web", label: "Keybase" };
    if (host.includes("steamcommunity.com") || host.includes("steampowered.com")) return { key: "steam", label: "Steam" };
    if (host.includes("producthunt.com")) return { key: "producthunt", label: "Product Hunt" };
    if (host.includes("angel.co") || host.includes("angellist.com")) return { key: "angellist", label: "AngelList" };
    if (host.includes("mastodon.social") || host.includes("mastodon.world") || host.includes("mastodon.")) return { key: "mastodon", label: "Mastodon" };
    if (host.includes("vk.com")) return { key: "vk", label: "VK" };
    if (host.includes("weibo.com")) return { key: "weibo", label: "Weibo" };
    if (host.includes("substack.com")) return { key: "substack", label: "Substack" };
    if (host.includes("cash.app")) return { key: "cashapp", label: "Cash App" };
    if (host.includes("venmo.com")) return { key: "venmo", label: "Venmo" };
    if (host.includes("paypal.com")) return { key: "paypal", label: "PayPal" };
    if (host.includes("ebay.com") || host.includes("ebay.")) return { key: "ebay", label: "eBay" };
    if (host.includes("etsy.com")) return { key: "etsy", label: "Etsy" };
    if (host.includes("fiverr.com")) return { key: "fiverr", label: "Fiverr" };
    if (host.includes("upwork.com")) return { key: "upwork", label: "Upwork" };
    if (host.includes("wordpress.com")) return { key: "wordpress", label: "WordPress" };
    if (host.includes("blogspot.com")) return { key: "blogspot", label: "Blogger" };
    if (host.includes("deviantart.com")) return { key: "deviantart", label: "DeviantArt" };
    if (host.includes("artstation.com")) return { key: "artstation", label: "ArtStation" };
    if (host.includes("strava.com")) return { key: "strava", label: "Strava" };
    if (host.includes("about.me")) return { key: "aboutme", label: "about.me" };
    if (host.includes("news.ycombinator.com")) return { key: "hackernews", label: "Hacker News" };
    if (host.includes("spotify.com")) return { key: "spotify", label: "Spotify" };
    if (host.includes("hackerone.com")) return { key: "web", label: "HackerOne" };
    if (host.includes("bugcrowd.com")) return { key: "web", label: "Bugcrowd" };
    if (host.includes("tryhackme.com")) return { key: "web", label: "TryHackMe" };
    if (host.includes("hackthebox") || host.includes("hackthebox.com")) return { key: "web", label: "HackTheBox" };
    return { key: "web", label: host };
  } catch {
    return { key: "web", label: "Web" };
  }
}

function inferPlatformForHandle(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("youtube") || lower.includes("yt/")) return "youtube";
  if (lower.includes("instagram") || lower.includes("ig/")) return "instagram";
  if (lower.includes("tiktok")) return "tiktok";
  if (lower.includes("github") || lower.includes("gh/")) return "github";
  if (lower.includes("discord")) return "discord";
  if (lower.includes("telegram") || lower.includes("t.me")) return "telegram";
  if (lower.includes("snapchat")) return "snapchat";
  if (lower.includes("facebook") || lower.includes("fb/")) return "facebook";
  if (lower.includes("linkedin") || lower.includes("li/")) return "linkedin";
  if (lower.includes("twitch")) return "twitch";
  if (lower.includes("reddit")) return "reddit";
  if (lower.includes("x.com") || lower.includes("twitter")) return "x";
  if (lower.includes("signal")) return "signal";
  if (lower.includes("whatsapp")) return "whatsapp";
  if (lower.includes("medium")) return "medium";
  if (lower.includes("patreon")) return "patreon";
  if (lower.includes("onlyfans")) return "onlyfans";
  if (lower.includes("soundcloud") || lower.includes("sc/")) return "soundcloud";
  if (lower.includes("pinterest")) return "pinterest";
  if (lower.includes("tumblr")) return "tumblr";
  if (lower.includes("threads")) return "threads";
  if (lower.includes("bluesky") || lower.includes("bsky")) return "bluesky";
  if (lower.includes("mastodon") || lower.includes("fedi")) return "mastodon";
  if (lower.includes("spotify")) return "spotify";
  if (lower.includes("vk.com") || lower.includes("vkontakte")) return "vk";
  if (lower.includes("weibo")) return "weibo";
  if (lower.includes("substack")) return "substack";
  if (lower.includes("cashapp") || lower.includes("cash.app") || lower.includes("$")) return "cashapp";
  if (lower.includes("venmo")) return "venmo";
  if (lower.includes("paypal")) return "paypal";
  if (lower.includes("ebay")) return "ebay";
  if (lower.includes("etsy")) return "etsy";
  if (lower.includes("fiverr")) return "fiverr";
  if (lower.includes("upwork")) return "upwork";
  if (lower.includes("deviantart")) return "deviantart";
  if (lower.includes("artstation")) return "artstation";
  if (lower.includes("strava")) return "strava";
  if (lower.includes("keybase")) return "keybase";
  if (lower.includes("hackernews") || lower.includes("hn/") || lower.includes("ycombinator")) return "hackernews";
  if (lower.includes("producthunt") || lower.includes("ph/")) return "producthunt";
  if (lower.includes("angellist") || lower.includes("angel.co")) return "angellist";
  if (lower.includes("steam")) return "steam";
  if (lower.includes("matrix")) return "matrix";
  if (lower.includes("slack")) return "slack";
  if (lower.includes("wordpress") || lower.includes("wp/")) return "wordpress";
  if (lower.includes("blogger") || lower.includes("blogspot")) return "blogspot";
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
  addFlag(result, "warn", "Check each link to make sure the info is correct before using it.");
  if (result.findings.some((finding) => finding.tags.includes("sensitive"))) {
    addFlag(result, "danger", "Sensitive personal info found. Be careful with it and do not share it publicly.");
  }
}

function buildSummary(result) {
  const handles = result.findings.filter((finding) => finding.tags.includes("handle"));
  const urls = result.findings.filter((finding) => finding.tags.includes("url"));
  const metadata = result.findings.filter((finding) => finding.tags.includes("metadata"));
  const webPages = result.webPages || [];
  const sensitiveCount = result.findings.filter((f) => f.tags.includes("sensitive")).length;
  const cryptoCount = result.findings.filter((f) => f.tags.includes("crypto")).length;
  const networkCount = result.findings.filter((f) => f.tags.includes("network")).length;
  const locationCount = result.findings.filter((f) => f.tags.includes("location")).length;

  if (result.transcriptResult?.ok) {
    const t = result.transcriptResult;
    const flags = t.flaggedSegments?.length || 0;
    const violation = t.violationAnalysis?.category;
    const base = `YouTube transcript: "${t.title || "Untitled"}" by ${t.channel || "Unknown"} — ${t.chunkCount} parts, ${t.wordCount} words.`;
    if (violation) return `${base} ⚠ ${violation}. See transcript tab.`;
    if (flags) return `${base} ⚠ ${flags} issue${flags === 1 ? "" : "s"} found. See transcript tab.`;
    return `${base} No issues found.`;
  }

  if (!result.findings.length && !result.sources.length) {
    return "No results yet.";
  }

  if (!result.findings.length && result.sources.length) {
    return `${result.sources.length} link${result.sources.length === 1 ? "" : "s"} created. Add website links to get page content.`;
  }

  const parts = [];
  if (webPages.length) parts.push(`${webPages.length} public web page${webPages.length === 1 ? "" : "s"} grabbed`);
  if (handles.length) parts.push(`${handles.length} handle${handles.length === 1 ? "" : "s"}`);
  if (urls.length) parts.push(`${urls.length} URL${urls.length === 1 ? "" : "s"}`);
  if (metadata.length) parts.push(`${metadata.length} metadata item${metadata.length === 1 ? "" : "s"}`);
  if (sensitiveCount) parts.push(`${sensitiveCount} sensitive data point${sensitiveCount === 1 ? "" : "s"}`);
  if (cryptoCount) parts.push(`${cryptoCount} crypto lead${cryptoCount === 1 ? "" : "s"}`);
  if (networkCount) parts.push(`${networkCount} network indicator${networkCount === 1 ? "" : "s"}`);
  if (locationCount) parts.push(`${locationCount} location clue${locationCount === 1 ? "" : "s"}`);

  const summary = parts.length ? parts.join(", ") : `${result.findings.length} result${result.findings.length === 1 ? "" : "s"} found`;
  const highestSignal = handles[0]?.value || urls[0]?.value || result.findings[0]?.value;
  return `${summary}. Top item: ${highestSignal}. Check links to verify.`;
}

function buildReport(result) {
  if (result.transcriptResult?.report) {
    const data = result.transcriptResult;
    let prefix = "";
    if (data.violationAnalysis?.category) {
      prefix = "⚠ ===== VIOLATION ANALYSIS ===== ⚠\n\n" +
        "```\n" + data.violationAnalysis.output1 + "\n```\n\n" +
        "```\n" + data.violationAnalysis.output2 + "\n```\n\n";
    }
    if (data.flaggedSegments?.length) {
      return prefix + "⚠ ===== FLAGGED CONTENT REPORT ===== ⚠\n\n" + data.report;
    }
    return prefix + data.report;
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

  const verifiedSources = result.sources.filter((s) => s.verified === true);
  if (verifiedSources.length) {
    lines.push("## ✅ Found Accounts");
    verifiedSources.forEach((s) => {
      lines.push(`- ${s.title}: ${s.url}`);
    });
    lines.push("");
  }

  lines.push("## Results Overview");
  const typeCounts = {};
  result.findings.forEach((f) => { typeCounts[f.type] = (typeCounts[f.type] || 0) + 1; });
  Object.entries(typeCounts).forEach(([type, count]) => {
    lines.push(`- ${count}x ${type}${count > 1 ? "" : ""}`);
  });
  lines.push("");

  lines.push("## All Results");
  if (!result.findings.length) {
    lines.push("- No results yet.");
  } else {
    result.findings.forEach((finding) => {
      lines.push(`- [${finding.confidence}] ${finding.type}: ${finding.value}`);
      if (finding.notes) lines.push(`  Notes: ${finding.notes}`);
      if (finding.source) lines.push(`  Source: ${finding.source}`);
      if (finding.tags.length) lines.push(`  Tags: ${finding.tags.join(", ")}`);
    });
  }

  lines.push("", "## Links");
  if (!result.sources.length) {
    lines.push("- No links yet.");
  } else {
    result.sources.forEach((source) => {
      lines.push(`- ${source.title}: ${source.url}`);
    });
  }

  lines.push("", "## Alerts");
  result.flags.forEach((flag) => {
    const label = flag.severity === "danger" ? "HIGH" : flag.severity === "warn" ? "MEDIUM" : flag.severity === "info" ? "INFO" : flag.severity;
    lines.push(`- [${label}] ${flag.message}`);
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
    elements.flagList.innerHTML = `<div class="empty-state">No alerts.</div>`;
    return;
  }

  elements.flagList.innerHTML = flags
    .map((flag) => {
      const sev = flag.severity === "info" ? "info" : flag.severity === "danger" ? "danger" : flag.severity === "warn" ? "warn" : "";
      return `<div class="flag ${sev}">${escapeHtml(flag.message)}</div>`;
    })
    .join("");
}

function renderFindings(findings) {
  if (!findings.length) {
    elements.findingList.innerHTML = `<div class="empty-state">No results yet.</div>`;
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
    elements.sourceList.innerHTML = `<div class="empty-state">No links yet.</div>`;
    return;
  }

  elements.sourceList.innerHTML = sources
    .map((source) => {
      const badge = source.verified === true
        ? `<span class="tag verified-tag">VERIFIED</span>`
        : source.verified === false
          ? `<span class="tag unverified-tag">UNCONFIRMED</span>`
          : "";
      return `
      <article class="source-card" style="${source.verified === true ? 'border-left:3px solid #000;background:#f6f6f6' : ''}">
        <input type="checkbox" ${source.checked ? "checked" : ""} data-source-id="${source.id}" aria-label="Select source">
        <div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>
            ${badge}
          </div>
          <p>${escapeHtml(source.kind)} - ${escapeHtml(source.target)}</p>
        </div>
        <button class="ghost-button compact" type="button" data-open-url="${escapeAttribute(source.url)}">
          <i data-lucide="external-link"></i>
          Open
        </button>
      </article>
    `;
    })
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
    container.innerHTML = `<div class="empty-state">No transcript yet. Paste a YouTube link and click Run.</div>`;
    return;
  }

  const chunks = transcriptResult.chunks || [];
  const flagged = transcriptResult.flaggedSegments || [];
  const flaggedStarts = new Set(flagged.map((f) => f.start));
  const flaggedReasons = {};
  flagged.forEach((f) => { flaggedReasons[f.start] = f.reason; });
  const analysis = transcriptResult.violationAnalysis;

  let html = "";

  // Violation Analysis section (new)
  if (analysis && analysis.category) {
    html += `<div class="section-heading" style="margin-top:0"><h2 style="color:#cc0000">⚠ Content Violation Analysis</h2></div>`;

    html += `<div style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:4px;margin-bottom:12px;font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap;overflow-x:auto">`;
    html += `<span style="color:#569cd6">\`\`\`</span>`;
    html += `\n${escapeHtml(analysis.output1)}\n`;
    html += `<span style="color:#569cd6">\`\`\`</span>`;
    html += `\n\n`;
    html += `<span style="color:#569cd6">\`\`\`</span>`;
    html += `\n${escapeHtml(analysis.output2)}\n`;
    html += `<span style="color:#569cd6">\`\`\`</span>`;
    html += `</div>`;

    html += `<hr style='margin:16px 0;border:none;border-top:1px solid #000'>`;
  }

  if (flagged.length) {
    html += `<div class="section-heading"><h2 style="color:#cc0000">⚠ Flagged Content (${flagged.length})</h2></div>`;
    flagged.forEach((seg) => {
      const ts = fmtTime(seg.start);
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
  } else if (!analysis || !analysis.category) {
    html += `<div class="empty-state">No issues found in this transcript.</div><hr style="margin:16px 0;border:none;border-top:1px solid #000">`;
  }

  html += `<div class="section-heading"><h2>Full Transcript</h2></div>`;

  chunks.forEach((chunk, i) => {
    const ts = fmtTime(chunk.start);
    const isFlagged = flaggedStarts.has(chunk.start);
    html += `
      <article class="finding"${isFlagged ? ' style="border-left:3px solid #cc0000;background:#fff5f5"' : ""}>
        <div class="finding-header">
          <div>
            <p class="finding-title">[${ts}]${isFlagged ? " ⚠" : ""}</p>
            <p class="finding-meta">Segment ${i + 1} / ${chunks.length}${isFlagged ? " — " + escapeHtml(flaggedReasons[chunk.start] || "Flagged") : ""}</p>
          </div>
          <span class="tag">${ts}</span>
        </div>
        <p class="finding-meta">${escapeHtml(chunk.text)}</p>
      </article>
    `;
  });

  container.innerHTML = html || `<div class="empty-state">Nothing in transcript.</div>`;
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
      setStatus("Text from photo added.");
    } else {
      setStatus("No text found in photo.", "warn");
    }
  } catch {
    setStatus("Could not read photo text. Try pasting it manually.", "warn");
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
  const fn = document.querySelector("#imageFileName");
  if (fn) fn.textContent = file.name;
  const actions = document.querySelector("#imageActions");
  if (actions) actions.style.display = "flex";
  setStatus(`Loaded ${file.name}.`);
}

function runImageSearch(mode) {
  if (!state.uploadedImage) { setStatus("Drop an image first.", "warn"); return; }
  const reader = new FileReader();
  reader.onload = async function (e) {
    const dataUrl = e.target.result;
    try {
      const resp = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl })
      });
      const data = await resp.json();
      if (data.url) {
        if (mode === "google") {
          window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(data.url)}`, "_blank");
        } else {
          window.open(`https://pimeyes.com/en`, "_blank");
          setTimeout(() => { window.open(`https://www.google.com/searchbyimage?image_url=${encodeURIComponent(data.url)}`, "_blank"); }, 500);
        }
        setStatus(`${mode === "google" ? "Image search" : "Face search"} opened.`);
      } else {
        setStatus("Upload failed.", "warn");
      }
    } catch {
      setStatus("Upload failed.", "warn");
    }
  };
  reader.readAsDataURL(state.uploadedImage);
}

function copyJson() {
  copyText(JSON.stringify(state.lastResult, null, 2), "Data copied.");
}

function copyReport() {
  copyText(elements.reportOutput.value, "Report copied.");
}

function copyTranscript() {
  const report = state.lastResult.transcriptResult?.report;
  if (report) {
    copyText(report, "Transcript report copied.");
  } else {
    setStatus("Nothing to copy yet.", "warn");
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
  renderResult(state.lastResult);
  setStatus("Ready.");
}

function setStatus(message, tone = "neutral") {
  elements.statusBox.textContent = message;
  elements.statusBox.dataset.tone = tone;
}

function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function smartTruncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text || "";
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.7) return truncated.slice(0, lastSpace) + "...";
  return truncated + "...";
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
