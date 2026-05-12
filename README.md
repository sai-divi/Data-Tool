# Data Tool
A tiny black-and-white public information tool for OSINT.

## What it does
- Grabs public URLs and extracts title, description, headings, links, and text snippets.
- Parses usernames, profile URLs, emails, dates, and timeline clues from pasted text.
- Runs browser-side OCR on uploaded screenshots with Tesseract.js.
- Generates public-source leads for YouTube, Instagram, TikTok, X, Reddit, GitHub, and Twitch.
- **YouTube Transcript mode** – fetches full transcripts and flags hate speech, profanity, racial slurs, racist rhetoric, propaganda, extremism, sexism, and threats with timestamps.
- Requires verified internet access before live web collection.
- Blocks localhost, private network, and reserved network targets for web grabs.
- Builds a copyable Markdown report and JSON export.
- Adds safety flags for private messages and sensitive contact data.

The .exe starts the local server and opens the app in your browser.

## Prerequisites

| Requirement | Notes |
|---|---|
| **Windows 7+** (64-bit) | Tested on Windows 10/11 |
| **Node.js** | Included at `C:\Users\Administrator\AppData\Local\OpenAI\Codex\bin\node.exe` – no separate install needed if using the launcher bundle. For a standalone setup, install Node.js 18+ from [nodejs.org](https://nodejs.org/) |
| **Microsoft Edge** | Installed at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`. Required for frameless app-mode window (`--app` flag). Chromium-based Edge is preinstalled on Windows 10+ |
| **Internet connection** | Required for web collection and YouTube transcript fetching |
| **No npm required** | The backend uses zero npm dependencies – pure Node.js built-in modules only |

## Running
Double-click `Data Tool.exe`. A system-tray icon appears; the app opens in a frameless Edge window. Right-click the tray icon → **Exit** to shut down.

## YouTube Transcript Mode
1. Click **YouTube Transcript** in the toolbar.
2. Paste a YouTube video URL and click **Submit**.
3. The transcript appears with flagged segments highlighted in red (with reason labels).
4. The **Findings** / **Safety** tabs show a flagged-content count and danger flags.
5. The **Report** tab includes a "FLAGGED CONTENT REPORT" section with timestamps.
6. Use **Copy Report** / **Download JSON** to export.

## Detection categories
- **Profanity** – common swear words
- **Racial slurs & rhetoric** – slurs, supremacy claims, race-war incitement
- **Homophobic / transphobic / LGBTQ+ hate** – slurs, calls for bans/violence
- **Ableist slurs** – derogatory disability-related terms
- **Religious hate** – antisemitism, Islamophobia, Nazi apologia, Holocaust denial
- **Xenophobia** – anti-immigration hate, deportation calls, ethnic stereotyping
- **Propaganda / extremism** – genocidal calls, Nazi/white-supremacist codes, conspiracy propaganda, incitement to violence
- **Sexism / misogyny** – discrimination, violence against women, rape apologia
- **Threats / incitement** – death threats, bomb/shooting threats, self-harm encouragement

## Responsible use
Use this only for public, authorized, or self-owned information. Do not use it to harass, stalk, dox, impersonate, bypass access controls, or publish private personal data. Generated cross-platform matches are leads, not proof.
Live collection checks internet access first. Public web grabs are limited to HTTP/HTTPS public internet URLs and block local/private network targets.