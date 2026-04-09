---
name: Test before pushing
description: User wants solutions tested and verified before pushing, not iterative trial-and-error via deploy logs
type: feedback
---

Don't push speculative fixes and ask the user to test. Test APIs locally, verify the fix works, then push a complete solution.

**Why:** User got frustrated after multiple rounds of push → check logs → push again. Each cycle wastes time and trust.

**How to apply:** Before pushing any fix, call the relevant external APIs directly (e.g., Evolution API) from the CLI to verify the fix works. Only push when confident the solution is correct.
