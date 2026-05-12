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
