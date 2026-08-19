---
name: Gemini vision model
description: Managed Gemini integration supports multimodal input through the current flash model list, not every historical Gemini model name.
---

Use the currently supported flash model for screenshot analysis rather than hard-coding a historical model name from an external prompt.

**Why:** Replit's managed Gemini integration rejects models outside its supported list, while the supported flash model accepts inline PNG/JPEG input.

**How to apply:** When adding vision features, keep the inline image payload small, use the supported flash model, and preserve the text-only fallback path.