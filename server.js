const http = require("http");
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const PUBLIC_METADATA_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "github.com",
  "twitch.tv"
]);
const ONLINE_CHECK_URLS = ["https://www.google.com/generate_204", "https://example.com/"];
const CONNECTION_CACHE_MS = 30000;
const MAX_WEB_GRAB_URLS = 8;
const MAX_WEB_GRAB_BYTES = 750000;
const MAX_REQUEST_BYTES = 65536;
let connectionCache = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendFile(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  const publicRelativePath = path.relative(PUBLIC_DIR, resolvedPath);

  if (publicRelativePath.startsWith("..") || path.isAbsolute(publicRelativePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

function normalizeYouTubeUrl(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return null;

  if (/^@[\w.-]{2,30}$/.test(trimmed)) {
    return `https://www.youtube.com/${trimmed}`;
  }

  if (/^[\w.-]{2,30}$/.test(trimmed)) {
    return `https://www.youtube.com/@${trimmed.replace(/^@/, "")}`;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (!YOUTUBE_HOSTS.has(parsed.hostname) && !YOUTUBE_HOSTS.has(host)) {
      return null;
    }
    parsed.protocol = "https:";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function getMeta(content, propertyName) {
  const propertyPattern = new RegExp(`<meta[^>]+property=["']${propertyName}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const namePattern = new RegExp(`<meta[^>]+name=["']${propertyName}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const propertyMatch = content.match(propertyPattern);
  const nameMatch = content.match(namePattern);
  return decodeHtml((propertyMatch || nameMatch || [])[1] || "");
}

function getTitle(content) {
  return decodeHtml((content.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "");
}

function getCanonical(content) {
  const match = content.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i);
  return decodeHtml((match || [])[1] || "");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

function isAllowedPublicHost(hostname) {
  return PUBLIC_METADATA_HOSTS.has(normalizeHost(hostname));
}

function normalizePublicMetadataUrl(rawValue) {
  try {
    const parsed = new URL(String(rawValue || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!isAllowedPublicHost(parsed.hostname)) return null;

    parsed.protocol = "https:";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function isBlockedIpv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a === 100 && b >= 64 && b <= 127 ||
    a === 192 && b === 0 ||
    a === 192 && b === 88 ||
    a === 198 && (b === 18 || b === 19) ||
    a >= 224
  );
}

function isBlockedIpv6(address) {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return true;
  if (value.startsWith("::ffff:")) {
    const ipv4 = value.replace("::ffff:", "");
    return net.isIP(ipv4) === 4 ? isBlockedIpv4(ipv4) : true;
  }
  return false;
}

function isBlockedIp(address) {
  const ip = String(address || "").replace(/^\[|\]$/g, "");
  const version = net.isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

async function assertPublicWebUrl(rawValue) {
  let parsed;

  try {
    parsed = new URL(String(rawValue || "").trim());
  } catch {
    throw new Error("Invalid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not supported.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Localhost URLs are blocked.");
  }

  const directIpVersion = net.isIP(hostname);
  const addresses = directIpVersion
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true, verbatim: false });

  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error("Private, local, or reserved network targets are blocked.");
  }

  parsed.hash = "";
  return parsed.toString();
}

async function readLimitedResponseText(response) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;

    if (totalBytes > MAX_WEB_GRAB_BYTES) {
      await reader.cancel();
      throw new Error("Response body is too large.");
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function extractLinks(content, baseUrl) {
  const links = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;

  while ((match = linkPattern.exec(content)) && links.length < 20) {
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.hash = "";
      const label = htmlToText(match[2]).slice(0, 90) || url.hostname;
      links.push({ label, url: url.toString() });
    } catch {
      // Ignore malformed page links.
    }
  }

  return links;
}

function extractHeadings(content) {
  const headings = [];
  const headingPattern = /<h([1-3])\b[^>]*>(.*?)<\/h\1>/gis;
  let match;

  while ((match = headingPattern.exec(content)) && headings.length < 12) {
    const text = htmlToText(match[2]);
    if (text) headings.push(text.slice(0, 140));
  }

  return headings;
}

function htmlToText(content) {
  return decodeHtml(
    String(content || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function summarizeGrabbedContent(content, contentType) {
  if (contentType.includes("html")) {
    return htmlToText(content).slice(0, 1800);
  }

  if (contentType.includes("json")) {
    return content.replace(/\s+/g, " ").trim().slice(0, 1800);
  }

  return content.replace(/\s+/g, " ").trim().slice(0, 1800);
}

function extractVideoId(rawValue) {
  const trimmed = String(rawValue || "").trim();
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function chunkTranscript(segments, maxChars = 500) {
  const chunks = [];
  let currentChunk = "";
  let currentStart = 0;
  for (const seg of segments) {
    const text = (seg.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (currentChunk.length + text.length + 1 > maxChars && currentChunk) {
      chunks.push({ text: currentChunk.trim(), start: currentStart });
      currentChunk = "";
      currentStart = seg.start;
    }
    if (!currentChunk) currentStart = seg.start;
    currentChunk += (currentChunk ? " " : "") + text;
  }
  if (currentChunk) chunks.push({ text: currentChunk.trim(), start: currentStart });
  return chunks;
}

function buildTranscriptReport(videoId, info, chunks, flaggedSegments) {
  const lines = [
    "YOUTUBE TRANSCRIPT REPORT",
    "=".repeat(60),
    "",
    `Video: ${info.title || "Unknown"}`,
    `Channel: ${info.channel || "Unknown"}`,
    `URL: https://www.youtube.com/watch?v=${videoId}`,
    `Total transcript segments: ${chunks.length}`,
    flaggedSegments.length ? `Potentially harmful content flagged: ${flaggedSegments.length} segment(s)` : "No potentially harmful content detected.",
    "",
    "=".repeat(60),
    "TRANSCRIPT WITH TIMESTAMPS",
    "=".repeat(60),
    ""
  ];
  chunks.forEach((chunk) => {
    const ts = formatTimestamp(chunk.start);
    lines.push(`[${ts}]`);
    lines.push(chunk.text);
    lines.push("");
  });
  if (flaggedSegments.length) {
    lines.push("=".repeat(60));
    lines.push("FLAGGED CONTENT REPORT");
    lines.push("=".repeat(60));
    lines.push("The following segments contain potentially harmful content");
    lines.push("(hate speech, racism, stereotyping, harassment, threats).");
    lines.push("");
    flaggedSegments.forEach((seg) => {
      lines.push(`[${formatTimestamp(seg.start)}] (${seg.reason})`);
      lines.push(seg.text);
      lines.push("");
    });
    lines.push("=".repeat(60));
    lines.push("End of flagged content report.");
  }
  lines.push("=".repeat(60));
  lines.push("End of transcript report.");
  return lines.join("\n");
}

const TOXIC_PATTERNS = [
  // ── Bad words / Profanity ──
  { pattern: /\bf[u4]ck(?:\s+|ing|e[dr])?\b/i, reason: "Profanity" },
  { pattern: /\bsh[i1]t(?:\s+|ting|head)?\b/i, reason: "Profanity" },
  { pattern: /\bb[i1]tch(?:\s+|ing|es|ass)?\b/i, reason: "Profanity" },
  { pattern: /\bd[a4]mn?\b/i, reason: "Profanity" },
  { pattern: /\b[a4]ss(?:hole|hat|wipe)?\b/i, reason: "Profanity" },
  { pattern: /\bb[a4]st[a4]rd\b/i, reason: "Profanity" },
  { pattern: /\bcr[a4]p\b/i, reason: "Profanity" },
  { pattern: /\bd[i1]ck(?:\s+|head)?\b/i, reason: "Profanity" },
  { pattern: /\bp[i1]ss\b/i, reason: "Profanity" },
  { pattern: /\bsl[u4]t\b/i, reason: "Profanity" },
  { pattern: /\bwh[o0]r[e3]\b/i, reason: "Profanity" },
  { pattern: /\bc[u4]nt\b/i, reason: "Profanity" },

  // ── Racial slurs and racial rhetoric ──
  { pattern: /\bn[i1]gg[ae3]r\b/i, reason: "Racial slur" },
  { pattern: /\bsp[i1]c\b/i, reason: "Racial slur" },
  { pattern: /\bch[i1]nk\b/i, reason: "Racial slur" },
  { pattern: /\bg[o0][o0]k\b/i, reason: "Racial slur" },
  { pattern: /\bw[o0]p\b/i, reason: "Ethnic slur" },
  { pattern: /\bm[a4]ng[i1]n[a4]?\b/i, reason: "Racial slur" },
  { pattern: /\bs[a4]nd n[i1]gg[e3]r\b/i, reason: "Racial slur" },
  { pattern: /\bt[a4]r[b4]aby[a4]?\b/i, reason: "Racial slur" },
  { pattern: /\b(?:bl[a4]ck|wh[i1]t[e3])\s+(?:sup[r4]em[a4]cy|m[a4]st[e3]r\s+r[a4]c[e3])\b/i, reason: "Racial supremacy" },
  { pattern: /\b(?:wh[i1]t[e3]\s+)?(?:sup[r4]em[a4]cist|n[a4]t[i1][o0]n[a4]l[i1]st\s+fr[o0]nt)\b/i, reason: "White supremacist ideology" },
  { pattern: /\bwh[i1]t[e3] sh[a4]v[e3]\b/i, reason: "White supremacist term" },
  { pattern: /\b[o0]verb[e3]r\b/i, reason: "White supremacist term" },
  { pattern: /\b[r4][e3]p[l4][a4]c[e3]ment th[e3][o0]ry\b/i, reason: "White supremacist conspiracy" },
  { pattern: /\b(?:bl[a4]ck\s+on\s+wh[i1]t[e3]|wh[i1]t[e3]\s+on\s+bl[a4]ck)\s+(?:cr[i1]m[e3]|viol[e3]nc[e3])\b/i, reason: "Racial incitement" },
  { pattern: /\b(?:g[a4]ng\s+st[a4]lk|r[a4]c[i1]al\s+pur[i1]ty)\b/i, reason: "Racist rhetoric" },
  { pattern: /\b(?:bl[a4]ck|wh[i1]t[e3]|j[e3]w|musl[i1]m)\s+(?:gen[o0]c[i1]d[e3]|r[a4]c[e3]\s+w[a4]r)\b/i, reason: "Racial incitement" },
  { pattern: /\b(?:bl[a4]cks?|wh[i1]t[e3]s?|j[e3]ws?)\s+(?:ar[e3]|should)\s+(?:inf[e3]ri[o0]r|sup[e3]ri[o0]r)\b/i, reason: "Racial supremacy" },
  { pattern: /\b(?:r[a4]c[e3]|c[o0]l[o0]r)\s+(?:w[a4]r|tr[a4]it[o0]r)\b/i, reason: "Racial incitement" },
  { pattern: /\b(?:bl[a4]ckf[a4]c[e3]|wh[i1]t[e3]f[a4]c[e3])\s+is\s+(?:g[o0][o0]d|b[e3]st|right)\b/i, reason: "Racist rhetoric" },

  // ── Homophobic / transphobic / LGBTQ+ hate ──
  { pattern: /\bf[a4]gg[o0]t\b/i, reason: "Homophobic slur" },
  { pattern: /\btr[a4]nn[y5]\b/i, reason: "Transphobic slur" },
  { pattern: /\bh[o0]m[o0]l[i1]b[e3]r[a4]l\b/i, reason: "Homophobic slur" },
  { pattern: /\b(?:g[a4]y|h[o0]m[o0]|l[e3]sb[i1]an)\s+(?:sh[o0]uld\s+b[e3]\s+kill[e3]d|is\s+a\s+sin|ar[e3]\s+disgusting)\b/i, reason: "Homophobic hate" },
  { pattern: /\btr[a4]nsg[e3]nd[e3]r\s+(?:is\s+a\s+dis[o0]rd[e3]r|sh[o0]uld\s+b[e3]\s+b[a4]nn[e3]d|is\s+n[a4]tural\s+s[e3]l[e3]ct[i1][o0]n)\b/i, reason: "Transphobic rhetoric" },
  { pattern: /\b(?:pr[i1]d[e3]|lgbt[q+]?)\s+(?:is\s+a\s+dis[e3]as[e3]|sh[o0]uld\s+b[e3]\s+il[l4]eg[a4]l)\b/i, reason: "Anti-LGBTQ+ hate" },

  // ── Ableist slurs ──
  { pattern: /\br[e3]t[a4]rd[e3]d?\b/i, reason: "Ableist slur" },
  { pattern: /\bsp[a4]z\b/i, reason: "Ableist slur" },
  { pattern: /\bm[i1]dget\b/i, reason: "Ableist slur" },
  { pattern: /\bcripple?\b/i, reason: "Ableist slur" },

  // ── Religious hate ──
  { pattern: /\bk[i1]k[e3]\b/i, reason: "Religious slur" },
  { pattern: /\br[a4]g[h4][e3]ad\b/i, reason: "Religious slur" },
  { pattern: /\b[j4]ew\s(?:c[o0]ntr[o0]l|m[o0]ney|l[i1]e|run\s+(?:the\s+)?w[o0]rld|c[o0]nspr[i1]cy)\b/i, reason: "Antisemitic stereotype" },
  { pattern: /\b(?:j[e3]w|j[e3]ws)\s+(?:ar[e3]|should)\s+(?:b[a4]nn[e3]d|kill[e3]d|d[e3]p[o0]rt[e3]d)\b/i, reason: "Antisemitic hate" },
  { pattern: /\b(?:h[o0]l[o0]caust|sh[o0][a4]h)\s+(?:h[o0][a4]x|l[i1]e|f[a4]k[e3]|m[a4]d[e3] up)\b/i, reason: "Holocaust denial" },
  { pattern: /\b(?:h[i1]tl[e3]r|n[a4]z[i1])\s+(?:was\s+right|did\s+nothing\s+wrong|sh[o0]uld\s+h[a4]v[e3])\b/i, reason: "Nazi apologia" },
  { pattern: /\bislam(?:ic|ist)?\s+(?:is\s+a\s+dis[e3]as[e3]|sh[o0]uld\s+b[e3]\s+b[a4]nn[e3]d|is\s+e[a4]sily\s+rad[i1]c[a4]l[i1]z[e3]d)\b/i, reason: "Islamophobic rhetoric" },
  { pattern: /\bm[u4]sl[i1]m\s+(?:r[a4]t|p[i1]g|d[o0]g|scr[u4]b)\b/i, reason: "Islamophobic slur" },
  { pattern: /\bch[r4]ist[i1][a4]n\s+(?:sh[o0]uld\s+b[e3]\s+kill[e3]d|ar[e3]\s+inf[e3]ri[o0]r)\b/i, reason: "Religious hate" },

  // ── Xenophobia / anti-immigration hate ──
  { pattern: /\b(?:fill[i1]ng?\s+up|inv[a4]d[i1]ng|t[a4]k[i1]ng\s+[o0]v[e3]r)\s+(?:the|our)\s+(?:country|nation|l[a4]nd|j[o0]bs)\b/i, reason: "Xenophobic rhetoric" },
  { pattern: /\b(?:send\s+them\s+b[a4]ck|d[e3]p[o0]rt\s+(?:them|them\s+all|il[l4]eg[a4]ls))\b/i, reason: "Xenophobic hate" },
  { pattern: /\b(?:il[l4]eg[a4]l\s+immigr[a4]nt|il[l4]eg[a4]l\s+ali[e3]n)\s+(?:cr[i1]m[e3]|r[a4]p[i1]st|kill[e3]r|th[i1]ng)\b/i, reason: "Xenophobic stereotype" },
  { pattern: /\b(?:immigr[a4]nts?|r[e3]fug[e3]es?)\s+(?:ar[e3]|should)\s+(?:inv[a4]d[i1]ng|criminals?|r[a4]pists?)\b/i, reason: "Xenophobic hate" },
  { pattern: /\b(?:g[o0][o0]k|ch[i1]nk|c[o0][o0]li[e3])\s+(?:g[o0]t\s+t[a4]\s+g[o0]|sh[o0]uld\s+l[e3]av[e3])\b/i, reason: "Xenophobic hate" },

  // ── Propaganda / extremism / radicalization ──
  { pattern: /\b(?:exterminat|eliminat|eradicat|wip[e3]\s?out)\s+(?:all|every|the|these|those)\b/i, reason: "Genocidal rhetoric" },
  { pattern: /\bkill\s+(?:all|every|those|the|these)\b/i, reason: "Violent extremism" },
  { pattern: /\b(?:d[i1]e|k[i1]ll)\s+y[o0]urs[e3]lf\b/i, reason: "Self-harm encouragement" },
  { pattern: /\by[o0]u\s+sh[o0]uld\s+(?:b[e3]\s+)?k[i1]ll\b/i, reason: "Threat" },
  { pattern: /\bi\s+(?:w[i1]ll|w[o0]n['']t\s+st[o0]p)\s+(?:k[i1]ll|hurt|d[i1]e|f[i1]nd|h[u4]nt)\b/i, reason: "Threat" },
  { pattern: /\b(?:h[a4]ng|lynch)\s+(?:'em|them|all|every|the)\b/i, reason: "Lynching threat" },
  { pattern: /\bsubhuman\b/i, reason: "Dehumanizing propaganda" },
  { pattern: /\b(?:inf[e3]ri[o0]r\s+(?:race|breed|p[e3][o0]pl[e3]))\b/i, reason: "Dehumanizing propaganda" },
  { pattern: /\b(?:r[a4]c[i1]al\s+pur[i1]ty|bl[o0][o0]d\s+pur[i1]ty|br[e3]ed\s+pur[i1]ty)\b/i, reason: "Eugenics rhetoric" },
  { pattern: /\b(?:g[e3]rm[a4]n|m[a4]st[e3]r)\s+r[a4]c[e3]\b/i, reason: "Nazi ideology" },
  { pattern: /\b(?:14\s+w[o0]rds|h[a4]il\s+h[i1]tl[e3]r|88\s+pr[e3]c[e3]pts)\b/i, reason: "White supremacist code" },
  { pattern: /\b(?:h[e3]il|s[i1][e3]g)\s+(?:h[i1]tl[e3]r|tr[u4]mp)\b/i, reason: "Extremist rhetoric" },
  { pattern: /\b(?:wr[a4]th\s+of\s+g[o0]d|divin[e3]\s+p[u4]nishm[e4]nt)\s+(?:up[o0]n|f[o0]r|a[a4]g[a4]inst)\b/i, reason: "Religious extremism" },
  { pattern: /\b(?:j[i1]h[a4]d|h[o0]ly\s+w[a4]r)\s+(?:is\s+|up[o0]n|call\s+f[o0]r)\b/i, reason: "Extremist rhetoric" },
  { pattern: /\b(?:r[e3]v[o0]l[u4]t[i1][o0]n|c[i1]v[i1]l\s+w[a4]r)\s+(?:n[o0]w|is\s+c[o0]ming|c[a4]ll\s+f[o0]r)\b/i, reason: "Incitement to violence" },
  { pattern: /\b(?:t[a4]k[e3]\s+up\s+[a4]rms|arm\s+y[o0]urs[e3]lv[e3]s)\b/i, reason: "Incitement to violence" },
  { pattern: /\b(?:el[i1]t[e3]|gl[o0]b[a4]l[i1]st)\s+(?:p[e3]d[o0]ph[i1]l[e3]|s[a4]t[a4]n[i1]st|c[a4]b[a4]l)\b/i, reason: "Conspiracy propaganda" },
  { pattern: /\b(?:n[e3]w\s+w[o0]rld\s+[o0]rd[e3]r|gr[e3][a4]t\s+r[e3]s[e3]t)\b/i, reason: "Conspiracy propaganda" },
  { pattern: /\b(?:wh[i1]t[e3]\s+gen[o0]c[i1]d[e3]|r[e3]pl[a4]c[e3]m[e3]nt)\b/i, reason: "White supremacist propaganda" },
  { pattern: /\b(?:m[a4]ss\s+immigr[a4]t[i1][o0]n|immigr[a4]t[i1][o0]n\s+inv[a4]s[i1][o0]n)\b/i, reason: "Anti-immigration propaganda" },
  { pattern: /\b(?:[a4]nt[i1][a4]-[a4]ll\s+|[a4]ll\s+[a4]r[e3]\s+)\s*(?:wh[i1]t[e3]|bl[a4]ck|j[e3]w|musl[i1]m|g[a4]y)s?\s+(?:ar[e3]|should)\b/i, reason: "Hate propaganda" },

  // ── Discrimination against women / sexism ──
  { pattern: /\b(?:w[o0]m[a4]n|w[o0]m[e3]n|g[i1]rl)\s+(?:sh[o0]uld\s+kn[o0]w\s+th[e3]ir\s+pl[a4]c[e3]|ar[e3]\s+inf[e3]ri[o0]r)\b/i, reason: "Sexist discrimination" },
  { pattern: /\b(?:f[e3]m[i1]n[i1]st|w[o0]m[e3]n['']s\s+r[i1]ghts)\s+(?:ar[e3]\s+stup[i1]d|sh[o0]uld\s+b[e3]\s+b[a4]nn[e3]d|g[o0][o0]n[e3]\s+cr[a4]zy)\b/i, reason: "Sexist hate" },
  { pattern: /\b(?:k[i1]ll|b[e3][a4]t|r[a4]p[e3])\s+(?:w[o0]m[e3]n?)\b/i, reason: "Violence against women" },
  { pattern: /\b(?:sl[u4]t|wh[o0]r[e3])\s+sh[a4]m[i1]ng\b/i, reason: "Misogynistic rhetoric" },
  { pattern: /\br[a4]p[e3]\s+(?:is\s+not\s+that\s+b[a4]d|sh[o0]uld\s+b[e3]\s+l[e3]g[a4]l|w[a4]s\s+h[e3]r\s+f[a4]ult)\b/i, reason: "Rape apologia" },
  { pattern: /\b(?:w[o0]m[e3]n\s+ar[e3]\s+pr[o0]p[e3]rty|w[o0]m[e3]n\s+b[e3]l[o0]ng\s+in\s+th[e3]\s+k[i1]tch[e3]n)\b/i, reason: "Sexist discrimination" },

  // ── Violence / threats / incitement ──
  { pattern: /\b(?:i['']?ll|i\s+will)\s+(?:kill|murder|slaughter)\s+(?:you|your|y[a4]ll)\b/i, reason: "Death threat" },
  { pattern: /\b(?:i['']?ll|i\s+will)\s+(?:find|hunt|track)\s+(?:you|y[a4]ll)\s+(?:down|and\s+kill)\b/i, reason: "Death threat" },
  { pattern: /\b(?:y[o0]u\s+ar[e3]\s+(?:g[o0]ing\s+t[o0]|g[o0]nn[a4])|y[o0]u['']?r[e3]e?)\s+(?:d[i1]e|g[e3]t\s+killed)\b/i, reason: "Threat" },
  { pattern: /\b(?:b[o0]mb|sh[o0][o0]t)\s+(?:up|the\s+place|a\s+sch[o0][o0]l|a\s+ch[u4]rch)\b/i, reason: "Violent threat" },
  { pattern: /\b(?:i\s+h[o0]p[e3]\s+y[o0]u\s+d[i1]e|y[o0]u\s+sh[o0]uld\s+d[i1]e|r[o0]tt[i1]n\s+in\s+h[e3]ll)\b/i, reason: "Death wish" },
];

function flagToxicContent(chunks) {
  const flagged = [];
  chunks.forEach((chunk) => {
    const text = chunk.text;
    for (const { pattern, reason } of TOXIC_PATTERNS) {
      if (pattern.test(text)) {
        flagged.push({ start: chunk.start, text: chunk.text, reason });
        break;
      }
    }
  });
  return flagged;
}

async function fetchYouTubeTranscript(videoId, signal) {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
  // 1) Fetch the watch page to extract the Innertube API key
  const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    signal,
    headers: { "User-Agent": userAgent, "Accept-Language": "en-US,en;q=0.9" }
  });
  const html = await pageResponse.text();
  if (html.includes('class="g-recaptcha"')) throw new Error("YouTube is rate-limiting requests.");

  // 2) Extract Innertube API key from the page
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!apiKeyMatch) throw new Error("Could not extract API key from YouTube page.");

  // 3) Also extract video title and channel from page
  const title = getMeta(html, "og:title") || getTitle(html);
  const channelMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/);
  const channel = channelMatch ? decodeHtml(channelMatch[1]) : "";

  // 4) Call Innertube player as ANDROID client to retrieve captionTracks
  const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKeyMatch[1]}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "User-Agent": userAgent },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
      videoId
    })
  });
  if (!playerRes.ok) throw new Error("Failed to retrieve player data.");
  const playerJson = await playerRes.json();
  const tracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || !tracks.length) throw new Error("No captions available for this video.");

  // 5) Pick the best track (prefer English)
  const track = tracks.find((t) => t.languageCode === "en" || t.languageCode?.startsWith("en")) || tracks[0];
  const baseUrl = track.baseUrl || track.url;
  if (!baseUrl) throw new Error("No caption track URL found.");

  // 6) Fetch the transcript XML
  const transcriptUrl = baseUrl.replace(/&fmt=[^&]+/, "");
  const captionsResponse = await fetch(transcriptUrl, { signal, headers: { "User-Agent": userAgent } });
  if (!captionsResponse.ok) throw new Error(`Failed to fetch captions (HTTP ${captionsResponse.status}).`);
  const xml = await captionsResponse.text();

  // 7) Parse XML
  const segments = [];
  const textPattern = /<text\s+start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = textPattern.exec(xml)) !== null) {
    const text = decodeHtml(match[3].replace(/\n/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (text) segments.push({ text, start: Number(match[1]) || 0, duration: Number(match[2]) || 0 });
  }
  if (!segments.length) throw new Error("No caption text could be extracted.");
  return { segments, title, channel };
}

async function handleYouTubeTranscript(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = requestUrl.searchParams.get("url") || requestUrl.searchParams.get("target");
  if (!target) {
    sendJson(res, 400, { ok: false, error: "A YouTube video URL is required." });
    return;
  }
  const videoId = extractVideoId(target);
  if (!videoId) {
    sendJson(res, 400, { ok: false, error: "Invalid YouTube video URL. Could not extract video ID." });
    return;
  }
  const connection = await checkInternetConnection();
  if (!connection.online) {
    sendJson(res, 503, { ok: false, videoId, error: "Internet connection is required." });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const { segments, title, channel } = await fetchYouTubeTranscript(videoId, controller.signal);
    const info = { title, channel };
    const chunks = chunkTranscript(segments);
    const flaggedSegments = flagToxicContent(chunks);
    const fullText = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    const report = buildTranscriptReport(videoId, info, chunks, flaggedSegments);
    sendJson(res, 200, {
      ok: true,
      videoId,
      title: info.title,
      channel: info.channel,
      segmentCount: segments.length,
      chunkCount: chunks.length,
      wordCount: fullText ? fullText.split(/\s+/).length : 0,
      chunks,
      flaggedSegments,
      fullText,
      report
    });
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      videoId,
      error: error.name === "AbortError" ? "The transcript request timed out." : error.message
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPublicWebPage(rawUrl, signal, redirectCount = 0) {
  const target = await assertPublicWebUrl(rawUrl);
  const response = await fetch(target, {
    redirect: "manual",
    signal,
    headers: {
      "User-Agent": "Mozilla/5.0 OSINTCollector/1.0 (+public web grabber)",
      "Accept": "text/html,text/plain,application/json,application/xml;q=0.8,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    if (redirectCount >= 4) throw new Error("Too many redirects.");
    const redirectedUrl = new URL(response.headers.get("location"), target).toString();
    return fetchPublicWebPage(redirectedUrl, signal, redirectCount + 1);
  }

  const contentType = response.headers.get("content-type") || "";
  const allowedContent = contentType.startsWith("text/") || /json|xml|html/i.test(contentType);
  if (!allowedContent) {
    throw new Error(`Unsupported content type: ${contentType || "unknown"}.`);
  }

  const content = await readLimitedResponseText(response);
  return {
    ok: response.ok,
    status: response.status,
    requestedUrl: rawUrl,
    finalUrl: target,
    contentType,
    title: getMeta(content, "og:title") || getTitle(content),
    description: getMeta(content, "description") || getMeta(content, "og:description"),
    canonical: getCanonical(content),
    headings: contentType.includes("html") ? extractHeadings(content) : [],
    links: contentType.includes("html") ? extractLinks(content, target) : [],
    text: summarizeGrabbedContent(content, contentType),
    fetchedAt: new Date().toISOString()
  };
}

async function checkInternetConnection(force = false) {
  const now = Date.now();
  if (!force && connectionCache && now - connectionCache.checkedAtMs < CONNECTION_CACHE_MS) {
    return connectionCache.result;
  }

  for (const target of ONLINE_CHECK_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(target, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 OSINTCollector/1.0 (+connection check)"
        }
      });

      if (response.ok || response.status === 204 || response.status === 405) {
        const result = {
          online: true,
          checkedAt: new Date().toISOString(),
          target,
          status: response.status
        };
        connectionCache = { checkedAtMs: now, result };
        return result;
      }
    } catch {
      // Try the next small public endpoint before reporting offline.
    } finally {
      clearTimeout(timeout);
    }
  }

  const result = {
    online: false,
    checkedAt: new Date().toISOString(),
    error: "No internet connection could be verified."
  };
  connectionCache = { checkedAtMs: now, result };
  return result;
}

async function fetchPublicMetadata(target, signal) {
  const response = await fetch(target, {
    redirect: "follow",
    signal,
    headers: {
      "User-Agent": "Mozilla/5.0 OSINTCollector/1.0 (+public metadata lookup)",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const content = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    requestedUrl: target,
    finalUrl: response.url,
    title: getMeta(content, "og:title") || getTitle(content),
    description: getMeta(content, "description") || getMeta(content, "og:description"),
    image: getMeta(content, "og:image"),
    canonical: getCanonical(content),
    fetchedAt: new Date().toISOString()
  };
}

async function handleConnectionCheck(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const result = await checkInternetConnection(requestUrl.searchParams.get("force") === "1");
  sendJson(res, result.online ? 200 : 503, result);
}

async function handleYouTubeLookup(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = normalizeYouTubeUrl(requestUrl.searchParams.get("target"));

  if (!target) {
    sendJson(res, 400, { ok: false, error: "Only public YouTube handles or URLs are supported." });
    return;
  }

  const connection = await checkInternetConnection();
  if (!connection.online) {
    sendJson(res, 503, {
      ok: false,
      requestedUrl: target,
      connection,
      error: "Internet connection is required for live YouTube collection."
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    sendJson(res, 200, await fetchPublicMetadata(target, controller.signal));
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      requestedUrl: target,
      error: error.name === "AbortError" ? "The YouTube lookup timed out." : "The YouTube lookup failed."
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handlePublicMetadataLookup(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = normalizePublicMetadataUrl(requestUrl.searchParams.get("url"));

  if (!target) {
    sendJson(res, 400, { ok: false, error: "Only allowlisted public platform URLs are supported." });
    return;
  }

  const connection = await checkInternetConnection();
  if (!connection.online) {
    sendJson(res, 503, {
      ok: false,
      requestedUrl: target,
      connection,
      error: "Internet connection is required for live public metadata collection."
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    sendJson(res, 200, await fetchPublicMetadata(target, controller.signal));
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      requestedUrl: target,
      error: error.name === "AbortError" ? "The public metadata lookup timed out." : "The public metadata lookup failed."
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleWebGrab(req, res) {
  let payload;

  try {
    payload = await readRequestJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
    return;
  }

  const requestedUrls = Array.isArray(payload.urls)
    ? payload.urls
    : [payload.url, ...(String(payload.text || "").match(/\bhttps?:\/\/[^\s<>"']+/gi) || [])];

  const urls = [...new Set(requestedUrls.map((url) => String(url || "").trim()).filter(Boolean))].slice(0, MAX_WEB_GRAB_URLS);
  if (!urls.length) {
    sendJson(res, 400, { ok: false, error: "Add at least one public URL to grab." });
    return;
  }

  const connection = await checkInternetConnection();
  if (!connection.online) {
    sendJson(res, 503, {
      ok: false,
      connection,
      error: "Internet connection is required for public web grabbing."
    });
    return;
  }

  const results = [];
  const failures = [];

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      results.push(await fetchPublicWebPage(url, controller.signal));
    } catch (error) {
      failures.push({
        url,
        error: error.name === "AbortError" ? "The web grab timed out." : error.message
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  sendJson(res, 200, {
    ok: results.length > 0,
    fetchedAt: new Date().toISOString(),
    limit: MAX_WEB_GRAB_URLS,
    results,
    failures
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.startsWith("/api/connection")) {
    handleConnectionCheck(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/youtube/transcript")) {
    handleYouTubeTranscript(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/youtube")) {
    handleYouTubeLookup(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/metadata")) {
    handlePublicMetadataLookup(req, res);
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/api/grab")) {
    handleWebGrab(req, res);
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  sendFile(req, res);
});

server.listen(PORT, () => {
  console.log(`Data Tool running at http://localhost:${PORT}`);
});
