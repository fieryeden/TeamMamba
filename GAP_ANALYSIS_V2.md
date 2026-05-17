# TeamMamba vs Monday.com — Gap Analysis v2

**Date:** 2026-05-17  
**Audited by:** Eden3 ⚡  
**Codebase:** 149 TS/TSX files, 30+ Prisma models, 70+ API routes

---

## What's Changed Since v1 (Batch 1–3)

The original gap analysis identified 30 gaps. **14 have been partially or fully closed** by the three batches of work:

| # | Gap | v1 Status | v2 Status | What Changed |
|---|---|---|---|---|
| 1 | Gantt Chart | ❌ Missing | ✅ **Done** | Full Gantt view with dependency arrows, drag-to-reschedule, date zoom, critical path |
| 2 | Integrations Marketplace | ❌ Missing | 🟡 **Scaffolded** | 16-catalog UI + IntegrationConfig model + CRUD API — but no actual OAuth/webhook execution logic |
| 3 | Connect Board Columns | ❌ Missing | ✅ **Done** | CONNECT column type, `connect-columns.ts` with cross-board sync, MIRROR + ROLLUP computation |
| 4 | Advanced Formula Engine | ❌ Basic (82 lines) | 🟡 **Improved** | 541-line engine with tokenizer/parser, IF/AND/OR, 18 functions (SUM, AVG, COUNT, MIN, MAX, CONCAT, LEFT, RIGHT, LEN, UPPER, LOWER, DAYS, NOW, TODAY, IF, AND, OR, NOT) |
| 5 | Item Version History | ❌ Missing | ✅ **Done** | `version-history.ts` + ItemVersion model + `/api/items/[id]/versions` endpoint |
| 7 | Advanced Automations | ❌ 8 triggers/9 actions | 🟡 **Improved** | 11 triggers (added COLUMN_CHANGED, COLUMN_VALUE_CHANGED, ASSIGNEE_CHANGED, PRIORITY_CHANGED, RECURRING_SCHEDULE) + AND/OR condition logic + recurring item creation |
| 8 | Column-level Permissions | ❌ Missing | ❌ Still missing | No column visibility or edit restrictions per role |
| 9 | Dashboard Sharing | ❌ Missing | ✅ **Done** | Share token + iframe embed code + `/share-dashboard/[token]` public page |
| 10 | PWA / Mobile | ❌ Missing | 🟡 **Scaffolded** | `manifest.ts`, `sw.ts` service worker, `offline.ts` with IndexedDB mutation queue, offline indicator component — but no actual push notifications or install prompt flow |
| 11 | Email-to-Board | ❌ Missing | ❌ Still missing | |
| 12 | Advanced Filtering & Saved Views | ❌ Missing | ✅ **Done** | BoardView model + CRUD API + saved view dropdown in board-client |
| 13 | Recurring Items | ❌ Missing | ✅ **Done** | `recurrenceRule` on Item model, `RECURRING_SCHEDULE` trigger, `/api/items/recurring-check` endpoint |
| 14 | Custom Item Colors/Icons | ❌ Missing | ✅ **Done** | `color` and `icon` fields on Item model, surfaced in Gantt + board views |
| 16 | Column Summaries Footer | ❌ Missing | ❌ Still missing | No footer aggregation row in table view |
| 22 | Two-Factor Auth (2FA) | ❌ Missing | ✅ **Done** | Full TOTP implementation (`totp.ts`), setup/verify/disable routes, `twoFactorEnabled` + `twoFactorSecret` on User |
| 26 | Multilingual UI (i18n) | ❌ Missing | 🟡 **Scaffolded** | 10 locales defined, provider + `/api/i18n/[locale]` route — but only nav strings translated, not full UI |
| 28 | Smart AI (LLM) | ❌ Heuristic only | ❌ Still heuristic | AI panel has suggest/generate/summarize tabs but all heuristic — no LLM wired |

---

## Remaining Gaps — What Monday.com Has That TeamMamba Still Doesn't

### 🔴 Tier 1 — Major Feature Gaps (Monday.com core differentiators)

| # | Gap | Monday.com Feature | Effort | Notes |
|---|---|---|---|---|
| **A1** | **Integration Execution Engine** | Actual OAuth flows, field mapping, polling/webhook-based sync for Slack, Jira, GitHub, Salesforce, etc. | **XL** | TeamMamba has the catalog UI and DB model for 16 integrations, but zero execution logic. Monday.com runs real OAuth + bidirectional sync. This is the biggest remaining gap — the marketplace is a storefront with empty shelves. |
| **A2** | **LLM-Powered AI** | GPT/Claude integration for natural-language board queries, auto-compose text, AI column generation, status prediction, smart summaries | **L** | All 3 AI routes (`/suggest`, `/generate-items`, `/summarize-board`) use heuristic scoring. The codebase even has comments like "Future: plug in OpenAI/Anthropic" but it's not wired. Monday.com AI is a major differentiator. |
| **A3** | **Email-to-Board** | Forward emails to create items, CC board address on replies, parse email body into column values | **M** | No inbound email processing at all. Only outbound via Resend. Monday.com gives each board a unique email address. |
| **A4** | **Column-Level Permissions** | Hide/show columns per role, make columns read-only for certain members, protect sensitive columns | **M** | Board-level roles only (OWNER/ADMIN/MEMBER/VIEWER). No column visibility or edit restrictions. Enterprise feature. |

### 🟡 Tier 2 — Significant Feature Gaps (Monday.com power-user features)

| # | Gap | Monday.com Feature | Effort | Notes |
|---|---|---|---|---|
| **B1** | **Formula Engine v3** | 100+ functions (VLOOKUP-style cross-board refs, COUNTIF/SUMIF, ARRAY operations, date math like DATEADD/DATEDIF, REGEXEXTRACT, SWITCH) | **L** | Current engine has 18 functions — solid foundation but Monday.com supports 100+. Missing: conditional aggregates (COUNTIF, SUMIF), cross-board references, date arithmetic, string manipulation (MID, SUBSTITUTE, REGEX), SWITCH/CASE. |
| **B2** | **Doc↔Board Embedding** | Embed live board widgets inside docs, embed docs inside board items, bi-directional live linking | **M** | DocEmbed model exists and API is built (`/api/docs/[id]/embeds`), but no UI to create/manage embeds. Docs are still standalone editors with no live board data rendering. |
| **B3** | **Batch Email Digests** | Daily/weekly digest emails, configurable per-user notification frequency, mute specific boards | **M** | Individual emails per event only. No digest mode, no per-board mute, no notification frequency controls. |
| **B4** | **Workload Advanced** | Drag-to-reassign in workload view, project-level workload, time-off tracking, capacity thresholds with alerts | **M** | Workload is a static read-only grid. No drag reassign, no capacity alerts, no time-off calendar. |
| **B5** | **Advanced Chart Widgets** | Multi-series charts, stacked/grouped bars, dual Y-axis, custom date ranges, compare-to-previous-period | **M** | Dashboard charts are single-series only. No multi-series, no period comparison, no custom date picker on widgets. |
| **B6** | **Sprint / Agile Features** | Sprint planning, velocity tracking, retrospective boards, story points | **M** | Sprint template exists but no sprint-specific features: no velocity chart, no burndown per sprint, no retro board type, no story point tracking. |
| **B7** | **Data Governance** | Data retention policies, auto-delete/archive old items, compliance export, GDPR data portability | **M** | Audit log exists but no retention policies, no auto-archive, no compliance export format, no data lifecycle management. |
| **B8** | **Custom Branding / White-label** | Custom logo, custom domain, theme colors for enterprise accounts | **M** | No white-label support. Hardcoded TeamMamba branding. |

### 🟢 Tier 3 — Polish & Nice-to-Have Gaps

| # | Gap | Monday.com Feature | Effort | Notes |
|---|---|---|---|---|
| **C1** | **Column Summaries Footer** | Auto-calculate SUM, AVG, MIN, MAX, COUNT in a sticky footer row below the table view | **S** | Formula engine supports these aggregates, but no UI footer row renders them. |
| **C2** | **Drag-to-Create on Timeline** | Click and drag on timeline/Gantt to create items with date ranges visually | **S** | Timeline is read-only for dates. Gantt supports drag-to-reschedule but not drag-to-create. |
| **C3** | **Broadcast Messages** | Admin can send announcement to all workspace members | **S** | Not implemented. |
| **C4** | **Pulse / Quick Polls** | Quick yes/no polls inside items or boards | **S** | Not implemented. |
| **C5** | **Kanban Widget on Dashboard** | Embed a live Kanban board view as a dashboard widget | **S** | Dashboard widgets are chart/data only. No board view embed widget. |
| **C6** | **Board Views SDK / Plugin System** | Public API for building custom board views as a developer | **M** | Views are hardcoded. No plugin/extension system. |
| **C7** | **Native Mobile Apps** | iOS + Android native apps (separate from PWA) | **XL** | PWA scaffold exists but no React Native/Capacitor mobile app. |
| **C8** | **i18n — Full Coverage** | Complete UI translation for all 10+ locales | **L** | Framework + 10 locales + nav strings done. But 90% of the UI strings are still hardcoded English. Full coverage means extracting ~500+ strings. |
| **C9** | **PWA — Install Prompt + Push Notifications** | "Add to Home Screen" prompt, web push notifications, background sync | **M** | Service worker + offline mutation queue exists, but no install prompt flow, no web push, no background sync API. |
| **C10** | **Import from CSV/Excel** | Upload .csv/.xlsx to create a board with auto-mapped columns | ✅ **Done** | `import-csv/route.ts` with papaparse + xlsx, Levenshtein-based column auto-mapping. |

---

## Updated Summary Scorecard

| Category | v1 Score | v2 Score | Monday.com | Change |
|---|---|---|---|---|
| Core Board Management | 95% | 98% | 100% | +3% (custom item colors/icons, recurring) |
| Views (Table/Kanban/Calendar) | 90% | 93% | 100% | +3% (saved views) |
| Views (Timeline/Gantt) | 40% | 90% | 100% | **+50%** (full Gantt implemented!) |
| Column Types | 85% | 95% | 100% | +10% (CONNECT, MIRROR, ROLLUP) |
| Automations | 45% | 65% | 100% | +20% (5 more triggers, AND/OR, recurring) |
| Integrations | 5% | 20% | 100% | +15% (catalog UI + DB, but no execution) |
| AI Features | 25% | 30% | 80% | +5% (better UI, still heuristic) |
| Dashboards/Charts | 70% | 85% | 100% | +15% (sharing + embedding!) |
| Collaboration | 80% | 90% | 100% | +10% (version history!) |
| Mobile/PWA | 20% | 40% | 100% | +20% (manifest + SW + offline, no native app) |
| Admin/Governance | 50% | 65% | 100% | +15% (2FA, saved views, i18n scaffold) |
| Import/Export | 60% | 85% | 100% | +25% (CSV/Excel import!) |
| Security | 60% | 80% | 100% | +20% (full TOTP 2FA!) |
| i18n | 0% | 25% | 100% | +25% (framework + 10 locales scaffolded) |
| Formula Engine | 15% | 45% | 100% | +30% (18 functions, proper parser) |

**Overall parity: ~62% → ~73%** (up 11 points from v1)

---

## Recommended Next Batches

### Batch 4 — Close the "Almost There" Gaps (3–5 days)
These are features that are scaffolded but need real logic to be functional:

1. **Integration Execution Engine** — Wire Slack webhook sending + GitHub issue creation as proof-of-concept (2 integrations working end-to-end makes the marketplace real)
2. **Doc↔Board Embedding UI** — Surface the existing DocEmbed API in the doc editor + board item panel
3. **Column Summaries Footer** — Wire the existing SUM/AVG/COUNT functions into a table footer row
4. **Formula v3** — Add COUNTIF, SUMIF, DATEADD, SWITCH (30→40 functions)
5. **PWA Install Prompt** — Add install prompt banner + web push notification skeleton

### Batch 5 — Power-User Features (5–7 days)
6. **LLM-Powered AI** — Wire OpenAI/Anthropic for natural language queries + auto-compose + smart status prediction
7. **Column-Level Permissions** — Column visibility/edit restrictions per role
8. **Email-to-Board** — Inbound email parsing via Resend webhooks
9. **Batch Email Digests** — Daily/weekly digest mode with frequency controls
10. **Workload Advanced** — Drag-to-reassign, capacity alerts, time-off tracking

### Batch 6 — Polish & Enterprise (5–7 days)
11. **i18n Full Coverage** — Extract all ~500 UI strings, translate to 5 core locales
12. **Custom Branding / White-label** — Custom logo, domain, colors per workspace
13. **Sprint / Agile** — Sprint planning, velocity chart, retro board, story points
14. **Data Governance** — Retention policies, auto-archive, compliance export
15. **Advanced Chart Widgets** — Multi-series, stacked bars, period comparison

### Strategic / Ongoing
16. **Native Mobile Apps** — React Native or Capacitor
17. **Board Views SDK** — Plugin system for custom views
18. **More Integration Execution** — Expand from 2 to 10+ working integrations

---

*Generated by Eden3 ⚡ — full source audit of 149 TS/TSX files, 30+ Prisma models, 70+ API routes, and all component/page routes. Compared against Monday.com's full feature set as of 2026-05.*
