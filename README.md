# Data Tool
A tiny black-and-white public information tool for OSINT.

## What it does
- Grabs public URLs and extracts title, description, headings, links, and text snippets.
- Parses usernames, profile URLs, emails, dates, and timeline clues from pasted text.
- Runs browser-side OCR on uploaded screenshots with Tesseract.js.
- Generates public-source leads for YouTube, Instagram, TikTok, X, Reddit, GitHub, and Twitch.
- Requires verified internet access before live web collection.
- Blocks localhost, private network, and reserved network targets for web grabs.
- Optionally checks public YouTube profile metadata through a no-dependency Node backend.
- Builds a copyable Markdown report and JSON export.
- Adds safety flags for private messages and sensitive contact data.

The .exe starts the local server and opens the app in your browser.

## Responsible use
Use this only for public, authorized, or self-owned information. Do not use it to harass, stalk, dox, impersonate, bypass access controls, or publish private personal data. Generated cross-platform matches are leads, not proof.
Live collection checks internet access first. Public web grabs are limited to HTTP/HTTPS public internet URLs and block local/private network targets.