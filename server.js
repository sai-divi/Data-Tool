const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
  "twitch.tv",
  "facebook.com",
  "linkedin.com",
  "pinterest.com",
  "tumblr.com",
  "medium.com",
  "soundcloud.com",
  "patreon.com",
  "onlyfans.com",
  "threads.net",
  "bsky.app",
  "telegram.org",
  "t.me",
  "whatsapp.com",
  "signal.org",
  "signal.me",
  "snapchat.com",
  "discord.com",
  "discord.gg",
  "behance.net",
  "dribbble.com",
  "flickr.com",
  "vimeo.com",
  "codepen.io",
  "keybase.io",
  "steamcommunity.com",
  "producthunt.com"
]);
const ONLINE_CHECK_URLS = ["https://www.google.com/generate_204", "https://example.com/"];
const CONNECTION_CACHE_MS = 30000;
const MAX_WEB_GRAB_URLS = 15;
const MAX_WEB_GRAB_BYTES = 2000000;
const MAX_REQUEST_BYTES = 65536;
const IMAGES_DIR = path.join(__dirname, "uploads");
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

  while ((match = linkPattern.exec(content)) && links.length < 40) {
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
  const headingPattern = /<h([1-4])\b[^>]*>(.*?)<\/h\1>/gis;
  let match;

  while ((match = headingPattern.exec(content)) && headings.length < 24) {
    const text = htmlToText(match[2]);
    if (text) headings.push(text.slice(0, 200));
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
  const summary = contentType.includes("html") ? htmlToText(content) : content.replace(/\s+/g, " ").trim();

  const words = summary.split(/\s+/);
  if (words.length > 400) {
    return words.slice(0, 400).join(" ") + `\n\n[... ${summary.length} total chars, ${words.length} total words; truncated to first 400 words]`;
  }
  return summary;
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
    "YOUTUBE TRANSCRIPT – FLAGGED CONTENT REPORT",
    "=".repeat(60),
    "",
    `Video: ${info.title || "Unknown"}`,
    `Channel: ${info.channel || "Unknown"}`,
    `URL: https://www.youtube.com/watch?v=${videoId}`,
    `Total segments examined: ${chunks.length}`,
    flaggedSegments.length ? `Potentially harmful content flagged: ${flaggedSegments.length} segment(s)` : "No potentially harmful content detected.",
    "",
    "=".repeat(60),
    flaggedSegments.length ? "TIMESTAMPS OF FLAGGED CONTENT" : "No flagged content found.",
    "=".repeat(60),
    ""
  ];
  if (flaggedSegments.length) {
    flaggedSegments.forEach((seg) => {
      lines.push(`[${formatTimestamp(seg.start)}] (${seg.reason})`);
      lines.push(seg.text);
      lines.push("");
    });
  }
  lines.push("=".repeat(60));
  lines.push("End of report.");
  return lines.join("\n");
}

const TOXIC_PATTERNS = [
  // ── Profanity / coarse language ──
  { pattern: /f[u4]ck(?:ing|e[dr])?/i, reason: "Profanity" },
  { pattern: /sh[i1]t(?:ting|head)?/i, reason: "Profanity" },
  { pattern: /b[i1]tch(?:ing|es|ass)?/i, reason: "Profanity" },
  { pattern: /\b[a4]ss(?:hole|hat|wipe)?\b/i, reason: "Profanity" },
  { pattern: /b[a4]st[a4]rd/i, reason: "Profanity" },
  { pattern: /d[i1]ck(?:head)?/i, reason: "Profanity" },
  { pattern: /p[i1]ss/i, reason: "Mild profanity" },
  { pattern: /sl[u4]t/i, reason: "Profanity" },
  { pattern: /wh[o0]r[e3](?:s|ing)?/i, reason: "Profanity" },
  { pattern: /c[u4]nt/i, reason: "Profanity" },
  { pattern: /\bt[i1]ts?\b/i, reason: "Mild profanity" },
  { pattern: /tw[a4]t/i, reason: "Profanity" },
  { pattern: /pr[i1]ck/i, reason: "Profanity" },
  { pattern: /b[o0]ll[o0]ck/i, reason: "Profanity" },
  { pattern: /[a4]rse/i, reason: "Mild profanity" },

  // ── Racial slurs (word-bounded to avoid substring false positives) ──
  { pattern: /\bn[i1]gg[ae3]r\b/i, reason: "Racial slur" },
  { pattern: /\bn[i1]gg[a4]\b/i, reason: "Racial slur" },
  { pattern: /\bn[i1]g[a4]?\b/i, reason: "Racial slur" },
  { pattern: /\bsp[i1]c\b/i, reason: "Racial slur" },
  { pattern: /\bsp[i1]ck\b/i, reason: "Racial slur" },
  { pattern: /\bch[i1]nk\b/i, reason: "Racial slur" },
  { pattern: /\bch[i1]nky\b/i, reason: "Racial slur" },
  { pattern: /g[o0][o0]k/i, reason: "Racial slur" },
  { pattern: /g[o0][o0]ky/i, reason: "Racial slur" },
  { pattern: /w[o0]p/i, reason: "Ethnic slur" },
  { pattern: /m[a4]ng[i1]n[a4]?/i, reason: "Racial slur" },
  { pattern: /s[a4]nd\s*n[i1]gg[ae3]r/i, reason: "Racial slur" },
  { pattern: /t[a4]r[b4]aby[a4]?/i, reason: "Racial slur" },

  { pattern: /b[i1]mb[o0]/i, reason: "Ethnic stereotype" },
  { pattern: /\bc[o0][o0]n\b/i, reason: "Racial slur" },
  { pattern: /j[i1]g[a4]b[o0][o0]/i, reason: "Racial slur" },
  { pattern: /p[o0]rch\s*m[o0]nkey/i, reason: "Racial slur" },
  { pattern: /m[o0]nkey\s*(?:see|hear|speak)?/i, reason: "Dehumanizing slur" },
  { pattern: /\b[a4]p[e3](?:s|ish)?\b/i, reason: "Dehumanizing slur" },
  { pattern: /c[o0]tt[o0]n\s*p[i1]ck[i1]ng/i, reason: "Racial slur" },
  { pattern: /bl[a4]ck\s*(?:sup[r4]em[a4]cy|m[a4]st[e3]r\s*r[a4]c[e3])/i, reason: "Racial supremacy" },
  { pattern: /wh[i1]t[e3]\s*(?:sup[r4]em[a4]cy|m[a4]st[e3]r\s*r[a4]c[e3])/i, reason: "White supremacist ideology" },
  { pattern: /wh[i1]t[e3]\s*sup[r4]em[a4]cist/i, reason: "White supremacist ideology" },
  { pattern: /n[a4]t[i1][o0]n[a4]l[i1]st\s*fr[o0]nt/i, reason: "White supremacist ideology" },
  { pattern: /wh[i1]t[e3]\s*sh[a4]v[e3]/i, reason: "White supremacist term" },
  { pattern: /wh[i1]t[e3]\s*gen[o0]c[i1]d[e3]/i, reason: "White supremacist propaganda" },
  { pattern: /[o0]v[e3]rb[e3]r/i, reason: "White supremacist term" },
  { pattern: /r[e3]pl[a4]c[e3]m[e3]nt\s*th[e3][o0]ry/i, reason: "White supremacist conspiracy" },
  { pattern: /gr[e3][a4]t\s*r[e3]pl[a4]c[e3]m[e3]nt/i, reason: "White supremacist propaganda" },
  { pattern: /bl[a4]ck\s*on\s*wh[i1]t[e3]\s*(?:cr[i1]m[e3]|viol[e3]nc[e3])/i, reason: "Racial incitement" },
  { pattern: /wh[i1]t[e3]\s*on\s*bl[a4]ck\s*(?:cr[i1]m[e3]|viol[e3]nc[e3])/i, reason: "Racial incitement" },
  { pattern: /g[a4]ng\s*st[a4]lk/i, reason: "Racist rhetoric" },
  { pattern: /r[a4]c[i1]al\s*pur[i1]ty/i, reason: "Racist rhetoric" },
  { pattern: /bl[a4]ck\s*gen[o0]c[i1]d[e3]/i, reason: "Racial incitement" },
  { pattern: /wh[i1]t[e3]\s*gen[o0]c[i1]d[e3]/i, reason: "White supremacist propaganda" },
  { pattern: /j[e3]w\s*gen[o0]c[i1]d[e3]/i, reason: "Antisemitic incitement" },
  { pattern: /musl[i1]m\s*gen[o0]c[i1]d[e3]/i, reason: "Islamophobic incitement" },
  { pattern: /bl[a4]cks?\s*ar[e3]\s*(?:inf[e3]ri[o0]r|sup[e3]ri[o0]r)/i, reason: "Racial supremacy" },
  { pattern: /wh[i1]t[e3]s?\s*ar[e3]\s*(?:inf[e3]ri[o0]r|sup[e3]ri[o0]r)/i, reason: "Racial supremacy" },
  { pattern: /j[e3]ws?\s*ar[e3]\s*(?:inf[e3]ri[o0]r|sup[e3]ri[o0]r)/i, reason: "Antisemitic rhetoric" },
  { pattern: /r[a4]c[e3]\s*w[a4]r/i, reason: "Racial incitement" },
  { pattern: /bl[a4]ckf[a4]c[e3]/i, reason: "Racial slur" },
  { pattern: /wh[i1]t[e3]f[a4]c[e3]/i, reason: "Racist rhetoric" },
  { pattern: /ethn[i1]c\s*cl[e3]ans[i1]ng/i, reason: "Genocidal rhetoric" },
  { pattern: /r[a4]c[e3]\s*tr[a4]it[o0]r/i, reason: "Racial incitement" },
  { pattern: /c[o0]l[o0]r\s*tr[a4]it[o0]r/i, reason: "Racial incitement" },
  { pattern: /bl[o0][o0]d\s*(?:qu[a4]ntum|line|pur[i1]ty)/i, reason: "Racial ideology" },

  // ── Homophobic / transphobic / anti-LGBTQ+ ──
  { pattern: /f[a4]gg[o0]t/i, reason: "Homophobic slur" },
  { pattern: /f[a4]ggy/i, reason: "Homophobic slur" },
  { pattern: /tr[a4]nn[y5]/i, reason: "Transphobic slur" },
  { pattern: /h[o0]m[o0]l[i1]b[e3]r[a4]l/i, reason: "Homophobic slur" },
  { pattern: /g[a4]y\s*sh[o0]uld\s*b[e3]\s*kill[e3]d/i, reason: "Homophobic hate" },
  { pattern: /h[o0]m[o0]\s*sh[o0]uld\s*b[e3]\s*kill[e3]d/i, reason: "Homophobic hate" },
  { pattern: /l[e3]sb[i1]an\s*sh[o0]uld\s*b[e3]\s*kill[e3]d/i, reason: "Homophobic hate" },
  { pattern: /g[a4]y\s*is\s*a\s*sin/i, reason: "Homophobic rhetoric" },
  { pattern: /h[o0]m[o0]\s*is\s*a\s*sin/i, reason: "Homophobic rhetoric" },
  { pattern: /l[e3]sb[i1]an\s*is\s*a\s*sin/i, reason: "Homophobic rhetoric" },
  { pattern: /g[a4]y\s*ar[e3]\s*disgusting/i, reason: "Homophobic hate" },
  { pattern: /h[o0]m[o0]\s*ar[e3]\s*disgusting/i, reason: "Homophobic hate" },
  { pattern: /tr[a4]nsg[e3]nd[e3]r\s*is\s*a\s*dis[o0]rd[e3]r/i, reason: "Transphobic rhetoric" },
  { pattern: /tr[a4]nsg[e3]nd[e3]r\s*sh[o0]uld\s*b[e3]\s*b[a4]nn[e3]d/i, reason: "Transphobic hate" },
  { pattern: /tr[a4]nsg[e3]nd[e3]r\s*is\s*n[a4]tural\s*s[e3]l[e3]ct[i1][o0]n/i, reason: "Transphobic rhetoric" },
  { pattern: /tr[a4]nsg[e3]nd[e3]r\s*(?:agenda|lobby|m[a4]fi[a4])/i, reason: "Transphobic conspiracy" },
  { pattern: /tr[a4]ns\s*(?:agenda|lobby|m[a4]fi[a4])/i, reason: "Transphobic conspiracy" },
  { pattern: /pr[i1]d[e3]\s*is\s*a\s*dis[e3]as[e3]/i, reason: "Anti-LGBTQ+ hate" },
  { pattern: /lgbt[q+]?\s*is\s*a\s*dis[e3]as[e3]/i, reason: "Anti-LGBTQ+ hate" },
  { pattern: /(?:pr[i1]d[e3]|lgbt[q+]?)\s*sh[o0]uld\s*b[e3]\s*il[l4]eg[a4]l/i, reason: "Anti-LGBTQ+ hate" },
  { pattern: /(?:pr[i1]d[e3]|lgbt[q+]?)\s*sh[o0]uld\s*b[e3]\s*b[a4]nn[e3]d/i, reason: "Anti-LGBTQ+ hate" },
  { pattern: /tr[a4]nsf[o0]b[i1][a4]/i, reason: "Transphobic content" },
  { pattern: /h[o0]m[o0]ph[o0]b[i1][a4]/i, reason: "Homophobic content" },
  { pattern: /str[a4]ight\s*pr[i1]d[e3]/i, reason: "Anti-LGBTQ+ rhetoric" },

  // ── Ableist slurs / disability hate ──
  { pattern: /\br[e3]t[a4]rd[e3]d?\b/i, reason: "Ableist slur" },
  { pattern: /\br[e3]t[a4]rd?\b/i, reason: "Ableist slur" },
  { pattern: /m[i1]dget/i, reason: "Ableist slur" },
  { pattern: /cr[i1]ppl[e3]d?/i, reason: "Ableist slur" },
  { pattern: /\bsch[i1]z[o0]\b/i, reason: "Ableist slur" },
  { pattern: /aut[i1]st[i1]c\s*(?:ar[e3]\s*stup[i1]d|sh[o0]uld)/i, reason: "Ableist hate" },

  // ── Religious hate ──
  { pattern: /\bk[i1]k[e3]\b/i, reason: "Religious slur" },
  { pattern: /r[a4]g[h4][e3]ad/i, reason: "Religious slur" },
  { pattern: /t[o0]w[e3]l\s*h[e3]ad/i, reason: "Religious slur" },
  { pattern: /(?:j[e3]w|j[e3]ws?)\s*(?:c[o0]ntr[o0]l|m[o0]ney|l[i1]e|run\s*the\s*w[o0]rld|c[o0]nspr[i1]cy)/i, reason: "Antisemitic stereotype" },
  { pattern: /j[e3]w\s*(?:r[u4]n|c[o0]ntr[o0]l)\s*(?:th[e3]|the)\s*(?:w[o0]rld|m[e3]d[i1][a4]|b[a4]nks?|g[o0]v[e3]rnm[e3]nt)/i, reason: "Antisemitic conspiracy" },
  { pattern: /shyl[o0]ck/i, reason: "Antisemitic slur" },
  { pattern: /\bh[e3]b[e3]\b/i, reason: "Antisemitic slur" },
  { pattern: /(?:j[e3]w|j[e3]ws)\s*(?:sh[o0]uld|b[e3])\s*(?:b[a4]nn[e3]d|kill[e3]d|d[e3]p[o0]rt[e3]d)/i, reason: "Antisemitic hate" },
  { pattern: /h[o0]l[o0]caust\s*(?:d[e3]ni[a4]l|h[o0][a4]x|l[i1]e|f[a4]k[e3]|m[a4]d[e3]_up|n[e3]v[e3]r\s*h[a4]pp[e3]n[e3]d)/i, reason: "Holocaust denial" },
  { pattern: /sh[o0][a4]h\s*(?:h[o0][a4]x|l[i1]e|f[a4]k[e3]|m[a4]d[e3]_up)/i, reason: "Holocaust denial" },
  { pattern: /(?:h[i1]tl[e3]r|n[a4]z[i1])\s*(?:was\s*right|did\s*nothing\s*wrong|sh[o0]uld\s*h[a4]v[e3])/i, reason: "Nazi apologia" },
  { pattern: /h[i1]tl[e3]r\s*(?:did\s*nothing\s*wrong|m[a4]d[e3]\s*g[o0][o0]d\s*p[o0][i1]nts)/i, reason: "Nazi apologia" },
  { pattern: /n[a4]z[i1]\s*(?:rule|ide[a4]ls?|ways?|w[a4]s\s*right|wer[e3]\s*right)/i, reason: "Neo-Nazi rhetoric" },
  { pattern: /islam(?:ic|ist)?\s*(?:is\s*a\s*dis[e3]as[e3]|sh[o0]uld\s*b[e3]\s*b[a4]nn[e3]d)/i, reason: "Islamophobic rhetoric" },
  { pattern: /islam(?:ic|ist)?\s*is\s*e[a4]sily\s*rad[i1]c[a4]l[i1]z[e3]d/i, reason: "Islamophobic stereotype" },
  { pattern: /r[a4]dic[a4]l\s*islam/i, reason: "Islamophobic rhetoric" },
  { pattern: /musl[i1]m\s*(?:r[a4]t|p[i1]g|d[o0]g|scr[u4]b|inv[a4]d[e3]r)/i, reason: "Islamophobic slur" },
  { pattern: /musl[i1]m\s*(?:men[a4]c[e3]|thr[e3][a4]t|pr[o0]bl[e3]m)/i, reason: "Islamophobic rhetoric" },
  { pattern: /c[a4]m[e3]l\s*j[o0]ck[e3]y/i, reason: "Islamophobic slur" },
  { pattern: /h[a4]jj[i1]/i, reason: "Religious slur" },
  { pattern: /ch[r4]ist[i1][a4]n\s*(?:sh[o0]uld\s*b[e3]\s*kill[e3]d|ar[e3]\s*inf[e3]ri[o0]r)/i, reason: "Anti-Christian hate" },
  { pattern: /(?:christ[i1][a4]n|ch[r4]ist[i1][a4]n|j[e3]sus)\s*(?:sh[o0]uld\s*b[e3]\s*banished|is\s*a\s*l[i1]e|is\s*f[a4]k[e3])/i, reason: "Anti-Christian rhetoric" },
  { pattern: /s[a4]t[a4]n[i1]c\s*(?:j[e3]w|j[e3]wish)/i, reason: "Antisemitic slur" },
  { pattern: /j[u4]d[e3][o0]-b[o0]h[e3]m[i1][a4]n/i, reason: "Antisemitic conspiracy" },
  { pattern: /z[i1][o0]n[i1]st\s*(?:[o0]ccup[a4]t[i1][o0]n|c[o0]nspiracy|agenda|c[o0]ntr[o0]l)/i, reason: "Antisemitic rhetoric" },

  // ── Xenophobia / anti-immigration / nationalist hate ──
  { pattern: /(?:fill[i1]ng?\s*up|inv[a4]d[i1]ng|t[a4]k[i1]ng\s*[o0]v[e3]r)\s*(?:the|our)\s*(?:country|nation|l[a4]nd|j[o0]bs)/i, reason: "Xenophobic rhetoric" },
  { pattern: /(?:g[o0]\s*b[a4]ck\s*t[o0]\s*y[o0]ur|g[o0]\s*h[o0]m[e3])\s*(?:c[o0]untry|h[o0]m[e3]|l[a4]nd|pe[o0]pl[e3])/i, reason: "Xenophobic hate" },
  { pattern: /send\s*(?:them|'em)\s*b[a4]ck/i, reason: "Xenophobic hate" },
  { pattern: /d[e3]p[o0]rt\s*(?:them|them_all|il[l4]eg[a4]ls|all)/i, reason: "Xenophobic hate" },
  { pattern: /il[l4]eg[a4]l\s*(?:immigr[a4]nt|ali[e3]n)\s*(?:cr[i1]m[e3]|r[a4]p[i1]st|kill[e3]r)/i, reason: "Xenophobic stereotype" },
  { pattern: /immigr[a4]nts?\s*(?:ar[e3]|should)\s*(?:inv[a4]d[i1]ng|criminals?|r[a4]pists?|sc[u4]m)/i, reason: "Xenophobic hate" },
  { pattern: /r[e3]fug[e3]es?\s*(?:ar[e3]|should)\s*(?:inv[a4]d[i1]ng|criminals?|r[a4]pists?|sc[u4]m)/i, reason: "Xenophobic hate" },
  { pattern: /(?:g[o0][o0]k|ch[i1]nk|c[o0][o0]li[e3])\s*(?:g[o0]t_ta_g[o0]|sh[o0]uld_l[e3]av[e3])/i, reason: "Xenophobic hate" },
  { pattern: /(?:y[o0]u\s*pe[o0]pl[e3]|y[o0]u\s*guys)\s*(?:n[e3][e3]d\s*t[o]\s*l[e3]av[e3]|sh[o0]uld\s*g[o0]\s*b[a4]ck)/i, reason: "Xenophobic hate" },
  { pattern: /n[o0]t\s*w[e3]lc[o0]m[e3]\s*h[e3]r[e3]/i, reason: "Xenophobic hate" },
  { pattern: /g[o0]\s*b[a4]ck\s*wh[e3]r[e3]\s*y[o0]u\s*c[a4]m[e3]\s*fr[o0]m/i, reason: "Xenophobic hate" },
  { pattern: /m[a4]ss\s*immigr[a4]t[i1][o0]n/i, reason: "Anti-immigration propaganda" },
  { pattern: /immigr[a4]t[i1][o0]n\s*inv[a4]s[i1][o0]n/i, reason: "Anti-immigration propaganda" },

  // ── Propaganda / extremism / radicalization ──
  { pattern: /(?:exterminat|eliminat|eradicat|wip[e3]_?out)\s*(?:all|every|the|these|those)/i, reason: "Genocidal rhetoric" },
  { pattern: /kill\s*(?:all|every|those|the|these)/i, reason: "Violent extremism" },
  { pattern: /purify\s*(?:th[e3]|the)\s*(?:r[a4]c[e3]|n[a4]t[i1][o0]n|l[a4]nd)/i, reason: "Genocidal rhetoric" },
  { pattern: /ethn[i1]c\s*cl[e3]ans[i1]ng/i, reason: "Genocidal rhetoric" },
  { pattern: /fin[a4]l\s*s[o0]l[u4]t[i1][o0]n/i, reason: "Genocidal rhetoric" },
  { pattern: /c[o0]nc[e3]ntr[a4]t[i1][o0]n\s*c[a4]mp/i, reason: "Genocidal reference" },
  { pattern: /(?:d[i1]e|k[i1]ll)\s*y[o0]urs[e3]lf/i, reason: "Self-harm encouragement" },
  { pattern: /y[o0]u\s*sh[o0]uld\s*(?:b[e3]\s*)?k[i1]ll/i, reason: "Threat" },
  { pattern: /(?:i[']?ll|i_will)\s*(?:kill|murder|slaughter)\s*(?:you|your|y[a4]ll)/i, reason: "Death threat" },
  { pattern: /(?:i[']?ll|i_will)\s*(?:find|hunt|track)\s*(?:you|y[a4]ll)\s*(?:down|and_kill)/i, reason: "Death threat" },
  { pattern: /(?:y[o0]u_ar[e3]\s*(?:g[o0]ing_t[o0]|g[o0]nn[a4])|y[o0]u[']?r[e3]e?)\s*(?:d[i1]e|g[e3]t_killed)/i, reason: "Threat" },
  { pattern: /i\s*(?:w[i1]ll|w[o0]n[']t_st[o0]p)\s*(?:k[i1]ll|hurt|d[i1]e|f[i1]nd|h[u4]nt)/i, reason: "Threat" },
  { pattern: /(?:h[a4]ng|lynch)\s*(?:'em|them|all|every|the)/i, reason: "Lynching threat" },
  { pattern: /(?:b[o0]mb|sh[o0][o0]t)\s*(?:up|the_place|a_sch[o0][o0]l|a_ch[u4]rch|a_m[a4]ll)/i, reason: "Violent threat" },
  { pattern: /(?:i_h[o0]p[e3]_y[o0]u_d[i1]e|y[o0]u_sh[o0]uld_d[i1]e|r[o0]tt[i1]n_in_h[e3]ll)/i, reason: "Death wish" },
  { pattern: /subhuman/i, reason: "Dehumanizing propaganda" },
  { pattern: /inf[e3]ri[o0]r\s*(?:race|breed|p[e3][o0]pl[e3])/i, reason: "Dehumanizing propaganda" },
  { pattern: /bl[o0][o0]d\s*pur[i1]ty/i, reason: "Eugenics rhetoric" },
  { pattern: /br[e3]ed\s*pur[i1]ty/i, reason: "Eugenics rhetoric" },
  { pattern: /(?:g[e3]rm[a4]n|m[a4]st[e3]r)\s*r[a4]c[e3]/i, reason: "Nazi ideology" },
  { pattern: /(?:14\s*w[o0]rds|h[a4]il_h[i1]tl[e3]r|88_pr[e3]c[e3]pts)/i, reason: "White supremacist code" },
  { pattern: /(?:h[e3]il|s[i1][e3]g)\s*(?:h[i1]tl[e3]r|tr[u4]mp)/i, reason: "Extremist rhetoric" },
  { pattern: /wr[a4]th\s*[o0]f\s*g[o0]d\s*(?:up[o0]n|f[o0]r)/i, reason: "Religious extremism" },
  { pattern: /divin[e3]\s*p[u4]nishm[e4]nt/i, reason: "Religious extremism" },
  { pattern: /(?:j[i1]h[a4]d|h[o0]ly_w[a4]r)\s*(?:is|up[o0]n|call_f[o0]r)/i, reason: "Extremist rhetoric" },
  { pattern: /(?:r[e3]v[o0]l[u4]t[i1][o0]n|c[i1]v[i1]l_w[a4]r)\s*(?:n[o0]w|is_c[o0]ming|c[a4]ll_f[o0]r)/i, reason: "Incitement to violence" },
  { pattern: /t[a4]k[e3]\s*up\s*[a4]rms/i, reason: "Incitement to violence" },
  { pattern: /arm\s*y[o0]urs[e3]lv[e3]s/i, reason: "Incitement to violence" },
  { pattern: /(?:el[i1]t[e3]|gl[o0]b[a4]l[i1]st)\s*(?:p[e3]d[o0]ph[i1]l[e3]|s[a4]t[a4]n[i1]st|c[a4]b[a4]l)/i, reason: "Conspiracy propaganda" },
  { pattern: /n[e3]w\s*w[o0]rld\s*[o0]rd[e3]r/i, reason: "Conspiracy propaganda" },
  { pattern: /gr[e3][a4]t\s*r[e3]s[e3]t/i, reason: "Conspiracy propaganda" },
  { pattern: /(?:[a4]nt[i1][a4]-[a4]ll|all_ar[e3])\s*(?:wh[i1]t[e3]|bl[a4]ck|j[e3]w|musl[i1]m|g[a4]y)s?\s*(?:ar[e3]|should)/i, reason: "Hate propaganda" },
  { pattern: /(?:wh[i1]t[e3]|bl[a4]ck|j[e3]w|musl[i1]m|g[a4]y)\s*sup[r4]em[a4]c/i, reason: "Supremacist ideology" },
  { pattern: /ethn[o0]st[a4]t[e3]/i, reason: "White supremacist ideology" },
  { pattern: /bl[o0][o0]d\s*and\s*s[o0][i1]l/i, reason: "Nazi ideology" },

  // ── Dog whistles / coded language / microaggressions ──
  { pattern: /cultur[a4]l\s*(?:enrichm[e3]nt|m[a4]rxism)/i, reason: "Dog whistle (extremist coded language)" },
  { pattern: /gr[o0][o0]ming\s*(?:agenda|childr[e3]n)/i, reason: "Anti-LGBTQ+ dog whistle" },
  { pattern: /r[a4]c[e3]\s*r[e3][a4]l[i1]st/i, reason: "Scientific racism dog whistle" },
  { pattern: /r[a4]c[i1]al\s*r[e3][a4]l[i1]sm/i, reason: "Scientific racism dog whistle" },
  { pattern: /sh[e3][a4]r[i1][a4]\s*l[a4]w/i, reason: "Islamophobic dog whistle" },
  { pattern: /islam[i1]z[a4]t[i1][o0]n/i, reason: "Islamophobic dog whistle" },
  { pattern: /eur[a4]b[i1][a4]/i, reason: "Islamophobic conspiracy" },
  { pattern: /h[a4]t[e3]\s*cr[i1]m[e3]\s*(?:h[o0][a4]x|f[a4]k[e3]|m[a4]d[e3]_up)/i, reason: "Hate crime denial" },
  { pattern: /g[o0]\s*b[a4]ck\s*t[o0]\s*y[o0]ur\s*(?:c[o0]untry|h[o0]m[e3]|culture|pe[o0]pl[e3])/i, reason: "Xenophobic hate" },

  // ── Sexism / misogyny ──
  { pattern: /(?:w[o0]m[a4]n|w[o0]m[e3]n|g[i1]rl)\s*(?:sh[o0]uld_kn[o0]w_th[e3]ir_pl[a4]c[e3]|kitch[e3]n|b[e3][a4]r[e3]f[o0][o0]t)/i, reason: "Sexist discrimination" },
  { pattern: /(?:w[o0]m[a4]n|w[o0]m[e3]n|g[i1]rl)\s*sh[o0]uld\s*(?:kn[o0]w_th[e3]ir|stay_in|b[e3]_in|n[o0]t_w[o0]rk)/i, reason: "Sexist discrimination" },
  { pattern: /w[o0]m[e3]n\s*ar[e3]\s*inf[e3]ri[o0]r/i, reason: "Sexist discrimination" },
  { pattern: /g[i1]rl\s*is\s*inf[e3]ri[o0]r/i, reason: "Sexist discrimination" },
  { pattern: /f[e3]m[i1]n[i1]st\s*(?:ar[e3]_stup[i1]d|sh[o0]uld_b[e3]_b[a4]nn[e3]d|g[o0]n[e3]_cr[a4]zy|ruin)/i, reason: "Sexist hate" },
  { pattern: /w[o0]m[e3]n[']?s\s*r[i1]ghts\s*(?:ar[e3]_stup[i1]d|sh[o0]uld_b[e3]_b[a4]nn[e3]d)/i, reason: "Sexist hate" },
  { pattern: /(?:k[i1]ll|b[e3][a4]t|r[a4]p[e3])\s*(?:w[o0]m[a4]n|w[o0]m[e3]n|g[i1]rl|h[e3]r)/i, reason: "Violence against women" },
  { pattern: /(?:sl[u4]t|wh[o0]r[e3])\s*sh[a4]m[i1]ng/i, reason: "Misogynistic rhetoric" },
  { pattern: /r[a4]p[e3]\s*(?:isn[']t|is_not|n[o0]t|sh[o0]uld|l[e3]g[a4]l)/i, reason: "Rape apologia" },
  { pattern: /r[a4]p[e3]\s*w[a4]s\s*h[e3]r\s*f[a4]ult/i, reason: "Rape apologia" },
  { pattern: /w[o0]m[e3]n\s*ar[e3]\s*pr[o0]p[e3]rty/i, reason: "Sexist discrimination" },
  { pattern: /w[o0]m[e3]n\s*b[e3]l[o0]ng\s*in\s*th[e3]\s*k[i1]tch[e3]n/i, reason: "Sexist discrimination" },
  { pattern: /m[a4]l[e3]\s*t[e3]ars/i, reason: "Misogynistic rhetoric" },
  { pattern: /f[e3]m[i1]n[a4]z[i1]/i, reason: "Misogynistic slur" },
  { pattern: /br[e3][e3]d[e3]r/i, reason: "Misogynistic slur" },
  { pattern: /k[i1]tch[e3]n\s*(?:b[i1]tch|sl[a4]v[e3])/i, reason: "Sexist slur" },

  // ── Age discrimination / generational hate ──
  { pattern: /b[o0][o0]m[e3]r\s*(?:g[e3]n[o0]c[i1]d[e3]|kill_all|sh[o0]uld_d[i1]e)/i, reason: "Ageist hate" },

  // ── Animal / dehumanizing comparisons ──
  { pattern: /(?:v[e3]rm[i1]n|p[a4]r[a4]s[i1]t[e3]|r[a4]ts?|pig|c[o0]ckr[o0][a4]ch[e3])\s*(?:pe[o0]pl[e3]|immigr[a4]nts?|r[e3]fug[e3]es?|min[o0]rit[i1]es?)/i, reason: "Dehumanizing language" },
  { pattern: /(?:d[o0]g|b[i1]tch|pr[a4]y)\s*wh[i1]stl[e3]/i, reason: "Dehumanizing language" },

  // ── Additional antisemitic / conspiracy dog whistles ──
  { pattern: /gl[o0]b[a4]l[i1]st(?:s|ic| agenda| elite)?/i, reason: "Antisemitic dog whistle" },
  { pattern: /cultur[a4]l\s*m[a4]rxism/i, reason: "Antisemitic dog whistle" },
  { pattern: /(?:j[e3]wish|j[e3]w)\s*l[o0]bby/i, reason: "Antisemitic conspiracy" },
  { pattern: /z[i1][o0]n[i1]st\s*[o0]ccup[a4]t[i1][o0]n\s*g[o0]v[e3]rnm[e3]nt/i, reason: "Antisemitic conspiracy (ZOG)" },
  { pattern: /k[o0]sh[e3]r\s*(?:n[a4]t[i1][o0]n|m[e3]d[i1][a4]|c[o0]nspr[i1]cy)/i, reason: "Antisemitic slur" },
  { pattern: /syn[a4]g[o0]gu[e3]\s*[o0]f\s*s[a4]t[a4]n/i, reason: "Antisemitic conspiracy" },
  { pattern: /j[u4]d[e3][o0]-m[a4]s[o0]n[i1]c/i, reason: "Antisemitic conspiracy" },
  { pattern: /j[u4]d[e3][o0]-b[o0]lsh[e3]v[i1]k/i, reason: "Antisemitic conspiracy" },
  { pattern: /[a4]uschw[i1]tz\s*(?:w[a4]s\s*a\s*r[e3]s[o0]rt|w[a4]sn[']?t_r[e3][a4]l|h[o0][a4]x)/i, reason: "Holocaust denial" },
  { pattern: /6_m[i1]ll[i1][o0]n\s*(?:l[i1]e|h[o0][a4]x|f[a4]k[e3])/i, reason: "Holocaust denial" },
  { pattern: /(?:1488|14_88|88_pr[e3]c[e3]pts)/i, reason: "White supremacist numeric code" },
  { pattern: /\b18(?:th)?\s*(?:w[o0]rd|l[e3]tt[e3]r|c[o0]d[e3]|pr[e3]c[e3]pt)\b/i, reason: "Neo-Nazi code" },

  // ── Additional anti-LGBTQ+ / grooming accusations ──
  { pattern: /gr[o0][o0]m[e3]r(?:s)?/i, reason: "Anti-LGBTQ+ slur" },
  { pattern: /gr[o0][o0]ming\s*child/i, reason: "Anti-LGBTQ+ hate" },
  { pattern: /dr[a4]g\s*qu[e3][e3]n\s*(?:st[o0]ry|sh[o0]w|h[o0]ur)/i, reason: "Anti-LGBTQ+ dog whistle" },
  { pattern: /tr[a4]nsg[e3]nd[e3]rism/i, reason: "Transphobic rhetoric" },
  { pattern: /r[a4]pid_[o0]ns[e3]t\s*g[e3]nd[e3]r\s*dysph[o0]ri[a4]/i, reason: "Transphobic conspiracy" },
  { pattern: /s[o0]cial_c[o0]nt[a4]gi[o0]n\s*(?:g[e3]nd[e3]r|tr[a4]ns)/i, reason: "Transphobic conspiracy" },
  { pattern: /b[i1][o0]l[o0]gic[a4]l\s*(?:m[a4]l[e3]|f[e3]m[a4]l[e3])\s*(?:in\s*a\s*w[o0]m[a4]n|tr[a4]ns)/i, reason: "Transphobic misgendering" },
  { pattern: /tr[a4]ns\s*id[e3][o0]l[o0]gy/i, reason: "Transphobic rhetoric" },
  { pattern: /(?:min[o0]rs?_in|childr[e3]n_at)\s*dr[a4]g_sh[o0]ws/i, reason: "Anti-LGBTQ+ dog whistle" },
  { pattern: /(?:g[a4]y|h[o0]m[o0]|l[e3]sb[i1][a4]n|tr[a4]ns)\s*(?:agenda|l[o0]bby)/i, reason: "Anti-LGBTQ+ conspiracy" },

  // ── Additional misogynistic / incel ──
  { pattern: /th[o0]t(?:s|ery)?/i, reason: "Misogynistic slur" },
  { pattern: /f[e3]m[o0]id(?:s)?/i, reason: "Misogynistic slur" },
  { pattern: /inc[e3]l(?:s|dom|ry)?/i, reason: "Incel ideology" },
  { pattern: /bl[a4]ckp[i1]ll(?:e[dr])?/i, reason: "Incel/misogynistic rhetoric" },
  { pattern: /l[o0]ksm[a4]xx[i1]ng/i, reason: "Incel ideology" },
  { pattern: /r[e3]dp[i1]ll[e3]d?(?:p[i1]ll)?\s*(?:mis[o0]gyn|w[o0]m[e3]n|f[e3]mini)/i, reason: "Misogynistic rhetoric" },
  { pattern: /tr[a4]dw[i1]f[e3]/i, reason: "Antifeminist propaganda" },
  { pattern: /p[a4]ssp[o0]rt\s*br[o0](?:s)?/i, reason: "Misogynistic rhetoric" },
  { pattern: /(?:[o4]nlyf[a4]ns|[o4]F)\s*m[o0]d[e3]l/i, reason: "Pejorative sex work reference" },
  { pattern: /(?:w[a4]it|w[a4]m[b4])[a4]?b[i1]t[i1]?s/i, reason: "Sexist harassment" },
  { pattern: /w[o0]m[e3]n\s*b[e3]\s*pr[o0]p[e3]rty/i, reason: "Sexist discrimination" },

  // ── Additional racial / supremacist ──
  { pattern: /bl[a4]ck\s*(?:cr[i1]m[e3]|r[a4]p[i1]st)\s*(?:st[a4]ts|st[a4]tistic)/i, reason: "Racial stereotype" },
  { pattern: /(?:wh[i1]t[e3]|bl[a4]ck)\s*gen[o0]c[i1]d[e3]/i, reason: "Racial incitement" },
  { pattern: /(?:cr[i1]tic[a4]l_r[a4]c[e3]_th[e3][o0]ry|crt)/i, reason: "Racial dog whistle" },
  { pattern: /d[e3][i1]\s*(?:hir[e3]|c[a4]ndid[a4]t[e3]|qu[o0]t[a4])/i, reason: "Anti-diversity slur" },
  { pattern: /[a4]ff[i1]rm[a4]t[i1]v[e3]\s*[a4]ct[i1][o0]n\s*(?:sl[u4]t|sh[a4]m|r[u4]in)/i, reason: "Anti-diversity rhetoric" },
  { pattern: /r[a4]c[e3]_mix(?:er|ing)?/i, reason: "Racial slur" },
  { pattern: /m[o0]ng[o0]l[o0]id/i, reason: "Racial slur" },
  { pattern: /(?:high_?iq|i\.q\.)\s*(?:r[a4]c[e3]|p[o0]pul[a4]t[i1][o0]n|gr[o0]up)/i, reason: "Scientific racism" },
  { pattern: /n[o0]rd[i1]c\s*(?:r[a4]c[e3]|supr[e3]m[a4]cy|p[o0]pul[a4]t[i1][o0]n)/i, reason: "White supremacist ideology" },
  { pattern: /(?:e[uo]r[o0]p[e3][a4]n|wh[i1]t[e3])\s*c[i1]v[i1]l[i1]z[a4]t[i1][o0]n/i, reason: "White supremacist dog whistle" },
  { pattern: /bl[a4]ckf[a4]sh/i, reason: "Racial slur" },
  { pattern: /p[a4]l[e3]st[i1]n[i1][a4]n\s*(?:r[a4]t|d[o0]g|p[i1]g)/i, reason: "Racial slur" },

  // ── Additional xenophobic / anti-immigration ──
  { pattern: /[a4]nch[o0]r\s*b[a4]by/i, reason: "Xenophobic slur" },
  { pattern: /ch[a4][i1]n_m[i1]gr[a4]t[i1][o0]n/i, reason: "Xenophobic rhetoric" },
  { pattern: /c[a4]r[a4]v[a4]n\s*(?:inv[a4]d[e3]|c[o0]m[i1]ng|h[o0]rd[e3])/i, reason: "Xenophobic rhetoric" },
  { pattern: /r[e3]fug[e3]e\s*cr[i1]s[i1]s/i, reason: "Xenophobic rhetoric" },
  { pattern: /(?:musl[i1]m|islam[i1]c)\s*inv[a4]s[i1][o0]n/i, reason: "Islamophobic rhetoric" },
  { pattern: /(?:cult[u4]r[a4]l|d[e3]m[o0]gr[a4]ph[i1]c)\s*r[e3]pl[a4]c[e3]m[e3]nt/i, reason: "White supremacist conspiracy" },
  { pattern: /wh[i1]t[e3]\s*fl[i1]ght/i, reason: "Racial rhetoric" },
  { pattern: /(?:n[o0]n-?wh[i1]t[e3]|n[o0]nwh[i1]t[e3])\s*(?:immigr[a4]t[i1][o0]n|inv[a4]s[i1][o0]n|p[o0]pul[a4]t[i1][o0]n)/i, reason: "White supremacist rhetoric" },
  { pattern: /(?:third_?w[o0]rld|3rd_w[o0]rld)\s*(?:immigr[a4]nt|inv[a4]d[e3]r|p[o0]v[e3]rty)/i, reason: "Xenophobic rhetoric" },
  { pattern: /sh[i1]th[o0]l[e3]\s*(?:c[o0]untry|n[a4]t[i1][o0]n|pe[o0]pl[e3])/i, reason: "Xenophobic hate" },
  { pattern: /br[e3][a4]x[i1]t\s*(?:w[a4]s_right|s[a4]v[e3]d_us)/i, reason: "Nationalist rhetoric" },

  // ── Additional extremist / terrorist ──
  { pattern: /[a4]cc[e3]l[e3]r[a4]t[i1][o0]n[i1]sm/i, reason: "Extremist accelerationism" },
  { pattern: /l[o0]n[e3]_w[o0]lf\s*(?:[a4]tt[a4]ck|act[i1][o0]n|warri[o0]r)?/i, reason: "Extremist rhetoric" },
  { pattern: /d[a4]y_[o0]f_th[e3]_r[o0]p[e3]/i, reason: "Extremist terrorism reference" },
  { pattern: /b[o0][o0]g[a4]l[o0][o0](?:b[o0]ys)?/i, reason: "Extremist movement reference" },
  { pattern: /[a4]t[o0]mw[a4]ff[e3]n/i, reason: "Neo-Nazi terrorist group" },
  { pattern: /s[e3]c[o0]nd_c[i1]v[i1]l_w[a4]r/i, reason: "Incitement to civil war" },
  { pattern: /st[o0]rm_th[e3]_c[a4]pit[o0]l/i, reason: "Incitement to violence" },
  { pattern: /h[a4]ng_\w+\s*(?:f[o0]r_tr[a4][i1]s[o0]n|tr[a4]it[o0]r)/i, reason: "Incitement to violence" },
  { pattern: /r[o0]p[e3]_\w+_s[e3]lf/i, reason: "Self-harm encouragement" },
  { pattern: /n[e3]ck_y[o0]urs[e3]lf/i, reason: "Self-harm encouragement" },
  { pattern: /d[o0]_th[e3]_w[o0]rld_[a4]_f[a4]v[o0]r(?:\s*y[o0]urs[e3]lf)?/i, reason: "Self-harm encouragement" },
  { pattern: /kys\b/i, reason: "Suicide encouragement" },
  { pattern: /(?:go_r[o0]p[e3]|g[o0]_r[o0]p[e3])/i, reason: "Self-harm encouragement" },
  { pattern: /tr[i1]gg[e3]r_everything/i, reason: "Threatening language" },



  // ── Additional ableist ──
  { pattern: /n[u4]mbnuts/i, reason: "Ableist slur" },
  { pattern: /wind[o0]w_l[i1]ck[e3]r/i, reason: "Ableist slur" },
  { pattern: /speci[a4]l\s*(?:ne[e3]ds|kind|ed)\s*(?:stup[i1]d|r[e3]t[a4]rd)/i, reason: "Ableist hate" },
  { pattern: /d[o0]wny(?:\s*syndrome)?\s*(?:kid|child|pe[o0]pl[e3])/i, reason: "Ableist slur" },
  { pattern: /r[a4][i1]nm[a4]n\s*(?:m[o0]m[e3]nt|j[o0]k[e3])/i, reason: "Ableist slur" },
  { pattern: /r[e3]t[a4]rd(?:ed)?\s*(?:l[i1]b|p[o0]lic[y5])/i, reason: "Ableist slur" },
  { pattern: /aut[i1]sm\s*(?:sp[e3]aks|aw[a4]r[e3]n[e3]ss)_m[o0]nth/i, reason: "Ableist discrimination" },

  // ── Additional bullying / harassment ──
  { pattern: /n[o0]b[o0]dy_l[i1]k[e3]s_y[o0]u/i, reason: "Harassment" },
  { pattern: /(?:every[o0]n[e3]|n[o0]_[o0]n[e3])\s*h[a4]t[e3]s_y[o0]u/i, reason: "Harassment" },
  { pattern: /y[o0]u['r]?e?\s*(?:us[e3]l[e3]ss|w[o0]rthl[e3]ss|a_disgr[a4]c[e3])/i, reason: "Harassment" },
  { pattern: /y[o0]u_sh[o0]uld\s*(?:un[a4]liv[e3]|k[i1]ll|d[i1]e|r[o0]p[e3])/i, reason: "Self-harm encouragement" },
  { pattern: /d[o0]_[a4]_f[a4]v[o0]r_[a4]nd_k[i1]ll_y[o0]urs[e3]lf/i, reason: "Self-harm encouragement" },
  { pattern: /w[o0]rld_[i1]s_b[e3]tt[e3]r_with[o0]ut_y[o0]u/i, reason: "Harassment" },
  { pattern: /n[o0]_[o0]n[e3]_w[a4]nts_y[o0]u_h[e3]r[e3]/i, reason: "Harassment" },

  // ── Misinformation / propaganda / disinformation ──
  { pattern: /(?:n[e3]v[e3]r\s*(?:had|been|achieved|experienced)|(?:h[a4](?:d|s)|h[a4]v[e3])\s*n[o0]t?\s*(?:been|had|achieved|experienced)?)\s*(?:a_)?(?:truly|r[e3]ally|tr[u4]e|genuine|lasting|a_)?\s*(?:united|independent|self[-\s]?(?:rul[e3]|g[o0]v[e3]rn(?:ment|ance)?)|st[a4]bl[e3]\s*(?:g[o0]v[e3]rnment?|p[e3]ri[o0]d|dem[o0]cracy|rule|n[a4]t[i1][o0]n))/i, reason: "Historical misinformation" },
  { pattern: /(?:import|imp[o0]rt)\s*(?:this|their|that|the)\s*(?:culture|cultural|game|way\s*of\s*life|values?|norms?|habits?|behavi[o0]r)/i, reason: "Xenophobic propaganda" },
  { pattern: /(?:turn(?:ing)?\s*(?:out|up)?\s*(?:like|into)|becom(?:e|ing)\s*(?:like|the\s*same\s*as)|end\s*up\s*(?:like|looking\s*like))\s*(?:india|china|africa|mexico|middle\s*east|third\s*world|developing|bangladesh|pakistan)/i, reason: "Civilizational fear-mongering" },
  { pattern: /risk\s*(?:the|our)\s*(?:west(?:ern)?|society|culture|civilization|way\s*of\s*life|future|n[a4]t[i1][o0]n)/i, reason: "Civilizational fear-mongering" },
  { pattern: /(?:d[o0]\s*we|sh[o0]uld\s*we)\s*(?:r[e3]ally|tr[u4]ly|h[o0]n[e3]stly)\s*w[a4]nt\s*t[o0]\s*(?:import|be[co0]m[e3]|turn\s*(?:out|into)|inv[i1]t[e3])/i, reason: "Xenophobic rhetoric" },
  { pattern: /l[e3]st\s*(?:we|the|our)\s*(?:risk|end\s*up|bec[o0]m[e3]|turn)/i, reason: "Doomsaying propaganda" },
  { pattern: /(?:deeply[\s_]+r[o0][o0]t[e3]d|ingrained)\s*(?:cultural|cultur[a4]l)[\s_]+(?:adapt[a4]t[i1][o0]ns|patterns?|tr[a4]its?|habits?)/i, reason: "Cultural determinism" },
  { pattern: /(?:wh[o0]l[e3]\s*(?:n[a4]t[i1][o0]n|c[o0]untry|cultur[e3]|pe[o0]pl[e3])|entir[e3]\s*(?:n[a4]t[i1][o0]n|c[o0]untry|cultur[e3]))\s*(?:is|ar[e3]|was|wer[e3])\s*(?:like|such|the\s*same)/i, reason: "Overgeneralization propaganda" },
  { pattern: /\bjug[a4]?[a4]?d\b/i, reason: "Cultural propaganda" },

  // ── Anti-immigrant "invasion"/"takeover"/"influx" framing ──
  { pattern: /(?:indian|immigrant|foreign|migrant|south.asian|bangladesh|pakistan)\s*(?:invasion|takeover|influx|flood|wave|horde)/i, reason: "Xenophobic hate" },
  { pattern: /invad(?:ed|ing)\s*(?:by|with)\s*(?:indian|immigrant|foreign|south.asian|bangladesh)/i, reason: "Xenophobic hate" },
  { pattern: /(?:never|didn't|did_not|nobody|no_one)\s*(?:vote|ask|consent)\s*(?:for|to)\s*(?:be|being|our)\s*(?:invaded|replaced|taken|colonized)/i, reason: "Anti-immigration propaganda" },

  // ── Ethnic stereotyping / hygiene / dehumanizing ──
  { pattern: /(?:indian|immigrant|foreign|these)\s*(?:people|guys|creatures|immigrants)?\s*(?:ar[e3]|are|was|were)\s*(?:generally|typically|usually|all|mostly)\s*(?:dirty|disgusting|gross|nasty|filthy|lazy|criminal|stupid|weird|creepy|loud)/i, reason: "Xenophobic hate" },
  { pattern: /\bdirty\s*(?:indian|immigrant|people|nation|race|country)\b/i, reason: "Xenophobic hate" },
  { pattern: /(?:eat(?:ing)?|consuming?|throw)\s*(?:poo|poop|shit|feces|excrement|human[\s_]+waste|waste|garbage|trash)/i, reason: "Dehumanizing stereotype" },
  { pattern: /(?:not\s*wearing|lack\s*of|without)\s*(?:deodorant|hygiene|soap)/i, reason: "Dehumanizing stereotype" },

  // ── "Everywhere" / "spawning" / demographic fear ──
  { pattern: /(?:spawn|popping?|materializ|appear|seem)\s*(?:up|out)?\s*(?:out\s*of|from)\s*(?:thin|nowher|everywhere|the[\s_]+ground)/i, reason: "Xenophobic rhetoric" },
  { pattern: /(?:indian|immigrant|foreign|these)\s*(?:people|guys|creatures)?\s*(?:ar[e3]|are|is)\s*(?:just|now|spread|taking|popping[\s_]*up)\s*(?:everywhere|all[\s_]+over|over)/i, reason: "Xenophobic rhetoric" },

  // ── Ethnic transformation / replacement terms ──
  { pattern: /(?:indian|immigrant|foreign|south.asian)\s*(?:ification|ization|isation)\b/i, reason: "Xenophobic hate" },
  { pattern: /(?:once|a[\s_]+once|formerly|previously)\s*(?:a[\s_]+)?\s*(?:small|quiet|peaceful|nice|beautiful|charming|sleepy|peaceful|quaint)\s*(?:town|city|area|neighborhood|community|village)\s*(?:turn(?:ed|ing)|became|become|transformed|converted|changed|has.*become)\s*(?:into|to)\s*(?:an?|a[\s_]?|the[\s_]?)?(?:indian|immigrant|foreign)/i, reason: "Xenophobic propaganda" },

  // ── "Fatigue" / anti-immigrant content template ──
  { pattern: /\b(?:indian|immigrant|foreign)\s*fatigue\b/i, reason: "Xenophobic propaganda" },

  // ── Dehumanizing slurs (bugman, subhuman) ──
  { pattern: /\bbugman\b/i, reason: "Dehumanizing slur" },
  { pattern: /godforsaken\s*(?:indian|african|asian|country|land|continent|subcontinent|nation|place)/i, reason: "Xenophobic hate" },

  // ── "Third world" as derogatory ──
  { pattern: /\bthird\s*[-\s]?world\b/i, reason: "Xenophobic rhetoric" },

  // ── Christian / Hindu / religious stereotyping ──
  { pattern: /(?:indian|hindu)\s*(?:worship|pray|bow|prostrat)\s*(?:animatronic|statue|idol|cow|monkey|rat|doll)/i, reason: "Religious hate" },
];

function flagToxicContent(chunks) {
  const flagged = [];
  chunks.forEach((chunk) => {
    const text = chunk.text;
    for (const { pattern, reason } of TOXIC_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        flagged.push({ start: chunk.start, text: chunk.text, reason, match: match[0].trim() });
        break;
      }
    }
  });
  return flagged;
}

const VIOLATION_CATEGORIES = [
  "Sexual content", "Violent or repulsive content", "Hateful or abusive content",
  "Harassment or bullying", "Harmful or dangerous acts", "Suicide self harm or eating disorders",
  "Misinformation", "Child abuse", "Promotes terrorism", "Spam or misleading", "Legal issue"
];

function classifyViolation(reasons) {
  const joined = reasons.join(" ");

  // Critical / highest severity
  if (/child.abuse|pedophil|minor.abuse|cp_|child.*p[o0]rn/i.test(joined)) return "Child abuse";
  if (/self.?harm|suicide|eating.disorder|anorexi|kill_yours[e3]lf|r[o0]p[e3]_yours[e3]lf|neck_yours[e3]lf/i.test(joined)) return "Suicide self harm or eating disorders";
  if (/terrorism|terrorist|jihad.*extremist|accelerationism|lone_wolf.*attack|atomwaffen|boogaloo/i.test(joined)) return "Promotes terrorism";

  // Violence / threats
  if (/death.threat|kill.*you|murder|shoot|bomb|lynch|hang.*traitor/ig.test(joined)) return "Violent or repulsive content";
  if (/violent.extremism|genocidal|violent.threat|civil.war|st[o0]rm_th[e3]_c[a4]pit[o0]l/i.test(joined)) return "Violent or repulsive content";
  if (/incitement.to.violence|take_up_arms|arm_yours[e3]lv[e3]s/i.test(joined)) return "Violent or repulsive content";

  // Hate speech — racial
  if (/racial.slur|racial.supremacy|racist|white.supremacist|racial.incitement|racial.rhetoric|hate.propaganda/i.test(joined)) return "Hateful or abusive content";
  if (/supremacist.ideology|dehumanizing|scientific.racism|race.war|ethnic.cleansing/i.test(joined)) return "Hateful or abusive content";
  if (/neo.nazi|nazi.ideology|nazi.apologia|white.supr[e3]m[a4]cist|white.genocide|white.shave|ethn[o0]st[a4]t[e3]/i.test(joined)) return "Hateful or abusive content";
  if (/antisemitic|jewish.conspiracy|zionist.*conspiracy|holocaust.denial|judeo/i.test(joined)) return "Hateful or abusive content";
  if (/islamophobic|muslim.*slur|muslim.*invasion|islamist.*disease|anti.christian|religious\.hate/i.test(joined)) return "Hateful or abusive content";
  if (/homophobic|transphobic|anti.lgbt|lgbt.hate|groomer.*lgbt|drag.*queen.*hate/i.test(joined)) return "Hateful or abusive content";
  if (/xenophobic|anti.immigration|anchor.baby|chain.migration|go_back_to_your|send_them_back|fear.mongering|civilizational|\.propaganda/i.test(joined)) return "Hateful or abusive content";

  // Misogyny / sexism
  if (/sexist|misogyn|violence.against.women|rape.apologia|incel|thot|femoid/i.test(joined)) return "Hateful or abusive content";
  if (/women.*property|women.*inferior|women.*kitchen|breeder|feminazi/i.test(joined)) return "Hateful or abusive content";

  // Harassment / bullying
  if (/harass|bully|death.wish|threat|othering|y[o0]u_pe[o0]pl[e]|these_pe[o0]pl[e]/i.test(joined)) return "Harassment or bullying";
  if (/worthless|useless.*you|nobody_likes|no_one_wants|hates_you/i.test(joined)) return "Harassment or bullying";

  // Misinformation
  if (/misinform|conspiracy\.|fake\.news|hoax|plandemic|scamdemic|covid.*hoax|vaccine.*microchip|q[a4]n[o0]n|newworldorder|great\.reset|depopulation|historical\.misinform|cultural\.determinism|overgeneralization|doomsaying/i.test(joined)) return "Misinformation";

  // Ableist / body shaming / profanity
  if (/ableist|body.shaming|ageist|dogwhistle/i.test(joined)) return "Hateful or abusive content";
  if (/profanity|mild.profanity/i.test(joined)) return "Hateful or abusive content";

  // Spam / misleading
  if (/spam|misleading|scam/i.test(joined)) return "Spam or misleading";

  return null;
}

function formatTimestampShort(seconds) {
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

function generateViolationReport(videoId, info, description, thumbnailUrl, segments, flaggedSegments) {
  const reasons = flaggedSegments.map((s) => s.reason);
  const category = classifyViolation(reasons);

  if (!category && !reasons.length) {
    return { category: null, output1: null, output2: null };
  }

  const cat = category || "Hateful or abusive content";
  const output1 = cat;

  const lines = [];
  // Thumbnail
  const thumbDesc = thumbnailUrl ? `Thumbnail for "${info.title || videoId}"` : "No thumbnail available";
  lines.push(`[thumbnail] "${thumbDesc}"`);
  // Title
  lines.push(`[title] "${info.title || "Untitled"}"`);
  // Description
  const descText = (description || "No description");
  lines.push(`[description] "${descText.length > 300 ? smartTruncate(descText, 300) : descText}"`);
  // Video segments
  flaggedSegments.forEach((seg) => {
    const text = seg.text || "";
    const displayText = text.length > 250 ? smartTruncate(text, 250) : text;
    lines.push(`[${formatTimestampShort(seg.start)}] "${displayText}"`);
  });
  if (!flaggedSegments.length) {
    lines.push(`[00:00] "Transcript content requires further review"`);
  }

  const output2 = lines.join("\n");

  return { category: cat, output1, output2, violationCount: flaggedSegments.length };
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

  // 4) Extract description and thumbnail from page
  const description = getMeta(html, "description") || getMeta(html, "og:description") || "";
  const thumbnailUrl = getMeta(html, "og:image") || "";

  // 5) Call Innertube player as ANDROID client to retrieve captionTracks
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

  // Use shortDescription from player JSON if meta description is empty
  const shortDesc = playerJson?.videoDetails?.shortDescription || "";
  const finalDescription = description || shortDesc;

  // Thumbnail fallback from player JSON
  const thumbs = playerJson?.videoDetails?.thumbnail?.thumbnails;
  const finalThumbnail = thumbnailUrl || (thumbs && thumbs.length ? thumbs[thumbs.length - 1].url : "");

  const tracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || !tracks.length) throw new Error("No captions available for this video.");

  // 6) Pick the best track (prefer English, then auto-generated English, then first available)
  const track = tracks.find((t) => t.languageCode === "en" && !t.kind) ||
    tracks.find((t) => t.languageCode === "en") ||
    tracks.find((t) => t.languageCode?.startsWith("en")) ||
    tracks.find((t) => t.languageCode === "a.en" || t.languageCode === "en-US" || t.languageCode === "en-GB") ||
    tracks[0];
  const baseUrl = track.baseUrl || track.url;
  if (!baseUrl) throw new Error("No caption track URL found.");

  // 7) Fetch the transcript XML
  const transcriptUrl = baseUrl.replace(/&fmt=[^&]+/, "");
  const captionsResponse = await fetch(transcriptUrl, { signal, headers: { "User-Agent": userAgent } });
  if (!captionsResponse.ok) throw new Error(`Failed to fetch captions (HTTP ${captionsResponse.status}).`);
  const xml = await captionsResponse.text();

  // 8) Parse XML
  const segments = [];
  const textPattern = /<text\s+start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = textPattern.exec(xml)) !== null) {
    const text = decodeHtml(match[3].replace(/\n/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    if (text) segments.push({ text, start: Number(match[1]) || 0, duration: Number(match[2]) || 0 });
  }
  if (!segments.length) throw new Error("No caption text could be extracted.");
  return { segments, title, channel, description: finalDescription, thumbnailUrl: finalThumbnail };
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
    const { segments, title, channel, description, thumbnailUrl } = await fetchYouTubeTranscript(videoId, controller.signal);
    const info = { title, channel, description, thumbnailUrl };
    const chunks = chunkTranscript(segments);
    const flaggedSegments = flagToxicContent(chunks);
    const fullText = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    const report = buildTranscriptReport(videoId, info, chunks, flaggedSegments);
    const violationAnalysis = generateViolationReport(videoId, info, description, thumbnailUrl, segments, flaggedSegments);
    sendJson(res, 200, {
      ok: true,
      videoId,
      title: info.title,
      channel: info.channel,
      description,
      thumbnailUrl,
      segmentCount: segments.length,
      chunkCount: chunks.length,
      wordCount: fullText ? fullText.split(/\s+/).length : 0,
      chunks,
      flaggedSegments,
      fullText,
      report,
      violationAnalysis
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

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (Buffer.byteLength(body) > maxBytes) { req.destroy(); reject(new Error("Too large")); } });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleVerifyProfiles(req, res) {
  let payload;
  try { payload = await readRequestJson(req); } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON." }); return;
  }
  const urls = Array.isArray(payload.urls) ? payload.urls.slice(0, 30) : [];
  if (!urls.length) {
    sendJson(res, 400, { ok: false, error: "No URLs provided." }); return;
  }

  const results = [];
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      const finalUrl = response.url || url;
      const status = response.status;

      // True account exists: 200 and final URL is not a search/404/signup page
      let exists = false;
      if (status >= 200 && status < 300) {
        const lowerFinal = finalUrl.toLowerCase();
        // Exclude signup, search, 404 pages
        if (lowerFinal.includes("signup") || lowerFinal.includes("sign_up") || lowerFinal.includes("register") || lowerFinal.includes("login") || lowerFinal.includes("404") || lowerFinal.includes("notfound") || lowerFinal.includes("search?")) {
          exists = false;
        } else {
          exists = true;
        }
      }

      results.push({ url, finalUrl, status, exists, checked: true, error: null });
    } catch (err) {
      results.push({ url, finalUrl: url, status: 0, exists: false, checked: true, error: err.name === "AbortError" ? "Timeout" : err.message });
    } finally {
      clearTimeout(timeout);
    }
  }

  sendJson(res, 200, { ok: true, results });
}

async function handleImageUpload(req, res) {
  let body;
  try { body = await readRawBody(req, 5242880); } catch { sendJson(res, 400, { ok: false, error: "Request too large." }); return; }
  try {
    const payload = JSON.parse(body);
    const dataUrl = payload.image;
    if (!dataUrl || !dataUrl.startsWith("data:image/")) { sendJson(res, 400, { ok: false, error: "Invalid image data." }); return; }
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) { sendJson(res, 400, { ok: false, error: "Unsupported image format." }); return; }
    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const buf = Buffer.from(matches[2], "base64");
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const filename = crypto.randomBytes(8).toString("hex") + "." + ext;
    fs.writeFileSync(path.join(IMAGES_DIR, filename), buf);
    const url = `http://localhost:${PORT}/uploads/${filename}`;
    sendJson(res, 200, { ok: true, url, filename });
  } catch { sendJson(res, 500, { ok: false, error: "Image upload failed." }); }
}

function proxyErrorPage(msg, originalUrl) {
  const safe = encodeURI(originalUrl || "");
  return `<!DOCTYPE html><meta charset="utf-8"><title>Could not load page</title>
<body style="margin:30px;font-family:sans-serif;background:#111;color:#eee">
<h2 style="margin-top:0">Could not load page</h2>
<p style="color:#999">${msg}</p>
<p><a href="${safe}" target="_blank" style="color:#88ccff">Open in browser &rarr;</a></p>
</body>`;
}

async function handleProxy(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = requestUrl.searchParams.get("url");
  const rawTarget = target;

  if (!target) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(proxyErrorPage("No URL provided."));
    return;
  }

  let validatedUrl;
  try {
    validatedUrl = await assertPublicWebUrl(target);
  } catch (err) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(proxyErrorPage(err.message, rawTarget));
    return;
  }

  const connection = await checkInternetConnection();
  if (!connection.online) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(proxyErrorPage("Internet connection is required.", rawTarget));
    return;
  }

  try {
    const response = await fetch(validatedUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const contentType = response.headers.get("content-type") || "text/html";
    const body = await response.text();

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(body);
  } catch (err) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(proxyErrorPage(err.message, rawTarget));
  }
}

async function handleEmbed(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = requestUrl.searchParams.get("url");
  if (!target) { res.writeHead(400); res.end("Missing url"); return; }

  let validatedUrl;
  try { validatedUrl = await assertPublicWebUrl(target); }
  catch { res.writeHead(400); res.end("Invalid URL"); return; }

  // Serve a wrapper page that tries to embed the target directly in an iframe
  const safe = validatedUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Embedded</title>
<style>body{margin:0;background:#111;display:flex;flex-direction:column;height:100vh}
iframe{flex:1;border:none;width:100%}
.fallback{display:none;padding:30px;font-family:sans-serif;color:#eee;text-align:center}
.fallback a{color:#88ccff}</style></head>
<body>
<iframe id="f" src="${safe}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
<div class="fallback" id="fb">
<h2>Blocked</h2><p>This site can't be embedded directly.</p>
<p><a href="${safe}" target="_blank">Open in browser &rarr;</a></p>
</div>
<script>
var f=document.getElementById("f");
var fb=document.getElementById("fb");
var loaded=false;
f.onload=function(){try{var doc=f.contentDocument||f.contentWindow.document;if(doc.body&&doc.body.innerHTML.length>0)loaded=true}catch(e){}setTimeout(function(){if(!loaded){f.style.display="none";fb.style.display="block"}},500)};
f.onerror=function(){f.style.display="none";fb.style.display="block"};
setTimeout(function(){if(!loaded){f.style.display="none";fb.style.display="block"}},3000);
</script></body></html>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const server = http.createServer((req, res) => {
  // CORS headers for images served to search engines
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");

  if (req.method === "POST" && req.url === "/api/verify-profiles") {
    handleVerifyProfiles(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/upload-image") {
    handleImageUpload(req, res);
    return;
  }

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

  if (req.method === "GET" && req.url.startsWith("/api/embed")) {
    handleEmbed(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/proxy")) {
    handleProxy(req, res);
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/uploads/")) {
    const filename = path.basename(req.url);
    const filePath = path.join(IMAGES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404); res.end("Not found"); return;
    }
    const ext = path.extname(filename).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  sendFile(req, res);
});

server.listen(PORT, () => {
  console.log(`Data Tool running at http://localhost:${PORT}`);
});
