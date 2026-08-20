---
name: OpenAPI and Zod compatibility
description: Generator annotations that are valid OpenAPI can still emit helpers unsupported by the workspace's installed Zod version.
---

Keep OpenAPI response fields compatible with the generated Zod runtime, not only with the OpenAPI specification. In this workspace, `format: uri` generated `zod.url()`, which is unavailable in the installed Zod 3 runtime; plain strings are safer unless the generator/runtime versions are aligned.

**Why:** Contract generation can succeed while the follow-up shared-library typecheck fails.

**How to apply:** After every OpenAPI change, run codegen and the workspace library typecheck before editing callers.