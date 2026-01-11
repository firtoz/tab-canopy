---
"@tabcanopy/extension": patch
---

Improve favicon display reliability and handle internal browser URLs

- Implement favicon proxy through background script to handle CORS-blocked favicons
- Add corsproxy.io as CORS proxy fallback service for inaccessible favicons
- Display puzzle icon for internal browser URLs (chrome://, about:, extension pages)
- Prevent CORS errors by not attempting to load favicons until proxy response received
- Cache favicon responses to reduce redundant fetches
