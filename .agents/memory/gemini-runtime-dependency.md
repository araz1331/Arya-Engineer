---
name: Gemini runtime dependency
description: Shared Gemini integration packages still need the SDK available to the executable API package at runtime.
---

The API package must declare the Gemini SDK as a direct runtime dependency even when it imports the client through a shared workspace library.

**Why:** The API bundle externalizes the SDK, so relying only on the shared library's dependency can produce a clean build followed by an ESM module-not-found error at startup.

**How to apply:** When adding or upgrading a managed AI integration used by the API, verify the executable server package can resolve the provider SDK after bundling.