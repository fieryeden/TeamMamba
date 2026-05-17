# TeamMamba vs Monday.com — Gap Analysis
**Date:** 2026-05-16  
**Audited by:** Eden3  
**Codebase:** `/home/rick/.openclaw/workspace/projects/teammamba/`

---

## What TeamMamba Already Has ✅

These are features where TeamMamba is **at parity or close** with Monday.com:

| Feature | Status |
|---|---|
| Board views: Table, Kanban, Calendar, Timeline | ✅ All 4 views implemented |
| Column types (16): TEXT, LONG_TEXT, NUMBER, STATUS, DATE, PEOPLE, TAGS, CHECKBOX, TIMELINE, LINK, FILE, FORMULA, PROGRESS, RATING, EMAIL, PHONE | ✅ Full column type catalog |
| Column resize, sort, drag-reorder | ✅ Implemented in board-client |
| Groups with color coding, drag reorder | ✅ @hello-pangea/dnd |
| Items: create, edit, delete, move between groups, batch ops | ✅ With bulk select/delete/status/move |
| Subitems | ✅ Expandable subitem rows |
| Time tracking | ✅ Start/stop/manual with API |
| Dependencies (FINISH_TO_START) | ✅ In item panel |
| Milestones | ✅ Dedicated model + API |
| Tags | ✅ Multi-tag with colors (stored as JSON) |
| Comments + reactions | ✅ With emoji reactions API |
| File uploads | ✅ S3-compatible upload route |
| Automations (8 triggers → conditions → 9 actions) | ✅ Builder + execution engine |
| Activity feed | ✅ /activities page with filters |
| Dashboard / Insights (10 widget types, recharts) | ✅ Create/edit/delete/reorder |
| Workload view | ✅ Per-member capacity grid |
| Docs (rich text, create/edit, board-link) | ✅ Blocknote-style editor |
| Webhooks (CRUD, event delivery, logs) | ✅ With retry/status tracking |
| Audit logs | ✅ Viewer component + API |
| Notifications (read/unread, action URLs) | ✅ With mark-all-read |
| Team management (members, roles, invite) | ✅ Owner/Admin/Member/Guest |
| Settings (theme, accent, email prefs, profile) | ✅ With next-themes |
| Board templates (5 built-in) | ✅ Project Tracker, Sprint, Bug Tracker, CRM, Content Calendar |
| Board import/export (JSON) | ✅ Full structure roundtrip |
| Guest access / share links | ✅ Read-only token-based |
| Public forms | ✅ /form/[boardId] |
| AI search (fuzzy across items, docs, comments) | ✅ Scored results |
| AI suggestions (assign, priority, status, categorize, summarize) | ✅ Heuristic-based |
| Real-time (Socket.io) | ✅ Board-level presence + mutations |
| Keyboard shortcuts | ✅ 10+ shortcuts in board view |
| Dark mode + accent colors | ✅ next-themes + CSS vars |
| Search (global) | ✅ Across boards |
| Board member avatars + presence indicators | ✅ Online/offline/away |

---

## Gaps — What Monday.com Has That TeamMamba Doesn't ❌

### 🔴 Tier 1 — Major Feature Gaps (Monday.com core differentiators)

| # | Gap | Monday.com Feature | Effort | Notes |
|---|---|---|---|---|
| **1** | **Gantt Chart View** | Full Gantt with dependency lines, critical path, drag-to-reschedule, date range zoom | **L** | TeamMamba has Timeline view (horizontal bars) but NOT a true Gantt with dependency arrows, critical path highlighting, or drag-to-reschedule. This is Monday.com's #1 differentiator. |
| **2** | **Integrations Marketplace** | 200+ native integrations (Slack, Jira, GitHub, Salesforce, Figma, Google Drive, Zendesk, HubSpot, etc.) with OAuth + field mapping UI | **XL** | TeamMamba has webhooks but zero native integrations. Monday.com's integration builder is a core selling point. |
| **3** | **Board-to-Board Linking (Connect Board column)** | Mirror/rollup columns across boards — see data from Board B inside Board A with live sync | **L** | TeamMamba has no cross-board column types. No MIRROR, ROLLUP, or CONNECT_BOARD column types. Each board is isolated. |
| **4** | **Advanced Formula Engine** | Full spreadsheet-like formula language with 100+ functions (SUM, COUNTIF, CONCATENATE, IF/AND/OR, VLOOKUP-like references, date math) | **M** | TeamMamba has a basic formula evaluator (82 lines) supporting simple arithmetic and column references. Monday.com's formulas are Turing-complete-ish. |
| **5** | **Item Version History** | Full revision history for every item — see who changed what, when, and revert to any prior state | **M** | TeamMamba has AuditLog but no item-level version/revision tracking. No revert capability. |
| **6** | **Doc-to-Board Embedding** | Embed live board widgets inside docs, embed docs inside board items, bi-directional linking | **M** | TeamMamba docs are standalone. No board widget embedding or live data frames inside docs. |

### 🟡 Tier 2 — Significant Feature Gaps (Monday.com power-user features)

| # | Gap | Monday.com Feature | Effort | Notes |
|---|---|---|---|---|
| **7** | **Advanced Automations** | 20+ triggers, 30+ actions, scheduled automations (cron-like), recurring item creation, conditional branching (if/then/else), delay/wait steps | **L** | TeamMamba has 8 triggers / 9 actions, no scheduled automations, no recurring item creation, no conditional branching beyond simple conditions. |
| **8** | **Column-level Permissions** | Hide/show columns per user role, make columns read-only for certain members | **M** | TeamMamba has board-level roles only. No column visibility or edit restrictions. |
| **9** | **Dashboard Sharing & Embedding** | Share dashboards externally via link, embed in Notion/confluence iframes | **S** | TeamMamba dashboards are auth-gated only. No public share or iframe embed. |
| **10** | **PWA / Mobile App** | Native iOS + Android apps, PWA with offline mode | **XL** | TeamMamba is responsive but no PWA manifest, no service worker, no offline support, no native app. |
| **11** | **Email-to-Board** | Forward emails to create items, CC board address on replies | **M** | TeamMamba has email notifications (Resend) but no inbound email processing. No "email this board" feature. |
| **12** | **Advanced Filtering & Saved Views** | Multi-condition filters (AND/OR groups), saved filter presets per user, shared views | **M** | TeamMamba has basic search/filter on board view. No saved views, no multi-condition filter builder, no AND/OR logic. |
| **13** | **Recurring Items** | Set items to auto-recreate on schedule (daily/weekly/monthly) | **S** | Not implemented. Could leverage automation engine. |
| **14** | **Custom Item Icons/Colors** | Per-item color labels, emoji icons, custom status icons | **S** | Items inherit group color only. No per-item color or icon customization. |
| **15** | **Batch Email Notifications** | Daily digest emails, configurable per-user notification frequency | **M** | TeamMamba sends individual emails per event via Resend. No digest mode, no notification frequency controls. |

### 🟢 Tier 3 — Polish & Differentiation Gaps (Monday.com nice-to-haves)

| # | Gap | Monday.com Feature | Effort | Notes |
|---|---|---|---|---|
| **16** | **Column Summaries in Footer** | Auto-calculate SUM, AVG, MIN, MAX, COUNT in a sticky footer row below the table | **S** | No footer aggregation row in table view. |
| **17** | **Drag-to-create items** | Click and drag on timeline/gantt to create items with date ranges | **S** | Timeline view is read-only for dates. No drag-to-create. |
| **18** | **Advanced Chart Widget Options** | Multiple data series, stacked/grouped bars, dual Y-axis, custom date ranges, compare-to-previous-period | **M** | TeamMamba charts are single-series only. No multi-series, no date range picker, no period comparison. |
| **19** | **Workload Advanced** | Drag to reassign, project-level workload, time-off tracking, capacity thresholds with alerts | **M** | TeamMamba workload is a static grid. No drag-to-reassign, no capacity alerts. |
| **20** | **Board Views API / SDK** | Public API for building custom board views as a developer | **M** | Views are hardcoded. No plugin/extension system. |
| **21** | **Import from CSV/Excel** | Upload .csv/.xlsx to create a board with auto-mapped columns | **M** | Import only supports TeamMamba's own JSON format. No CSV/Excel import. |
| **22** | **Two-Factor Auth (2FA)** | TOTP-based 2FA for accounts | **S** | Not implemented. |
| **23** | **Custom Branding / White-label** | Custom logo, domain, colors for enterprise accounts | **M** | No white-label support. |
| **24** | **Broadcast Messages** | Admin can send announcement to all workspace members | **S** | Not implemented. |
| **25** | **Data Governance** | Data retention policies, auto-delete old items, compliance export | **M** | No retention policies. Audit log exists but no data lifecycle. |
| **26** | **Multilingual UI (i18n)** | 15+ language support | **L** | English only. No i18n framework. |
| **27** | **Pulse / Quick Polls** | Quick yes/no polls inside items or boards | **S** | Not implemented. |
| **28** | **Smart Suggestions (AI)** | LLM-powered auto-compose, AI column generation, AI status prediction, natural language board queries | **L** | TeamMamba AI is heuristic-only (keyword matching, workload balance). No LLM integration. The API route says "Future: plug in OpenAI/Anthropic" but it's not wired. |
| **29** | **Widget: Kanban on Dashboard** | Embed a live Kanban board widget on the dashboard | **S** | Dashboard widgets are chart/data only. No board view embed widget. |
| **30** | **Sprint / Agile Features** | Sprint planning, velocity tracking, retrospective boards | **M** | No sprint-specific features beyond the template. No velocity charts. |

---

## Summary Scorecard

| Category | TeamMamba | Monday.com | Gap |
|---|---|---|---|
| Core Board Management | 95% | 100% | Minimal |
| Views (Table/Kanban/Calendar) | 90% | 100% | Missing Gantt |
| Views (Timeline/Gantt) | 40% | 100% | Major — no Gantt |
| Column Types | 85% | 100% | Missing Connect/Mirror/Rollup |
| Automations | 45% | 100% | Significant |
| Integrations | 5% | 100% | Critical gap |
| AI Features | 25% | 80% | Major — no LLM |
| Dashboards/Charts | 70% | 100% | Moderate |
| Collaboration | 80% | 100% | Missing item versioning |
| Mobile/PWA | 20% | 100% | Major |
| Admin/Governance | 50% | 100% | Moderate |
| Import/Export | 60% | 100% | Missing CSV/Excel |
| Security | 60% | 100% | Missing 2FA, column perms |

---

## Recommended Priority Order

### Quick Wins (1-2 days each)
1. **Column Summaries Footer** — Add SUM/AVG/COUNT/MIN/MAX in table footer
2. **Recurring Items** — Add to automation engine (schedule trigger → create item)
3. **Custom Item Colors/Icons** — Add color + emoji fields to Item model
4. **Dashboard Sharing** — Public link + iframe embed (pattern: reuse guest-access)
5. **2FA** — TOTP with `otplib`

### Medium Effort (3-7 days each)
6. **Advanced Filtering + Saved Views** — Multi-condition builder, persist per-user
7. **Item Version History** — Add ItemVersion model, capture on mutation, revert UI
8. **Formula Engine v2** — Expand to 30+ functions (IF, CONCATENATE, DATEADD, etc.)
9. **Doc↔Board Embedding** — Embed live board data tables inside docs
10. **CSV/Excel Import** — Parse with papaparse/xlsx, auto-map columns

### Large Effort (1-3 weeks each)
11. **Gantt Chart View** — Full dependency arrows, critical path, drag-to-reschedule
12. **Connect Board Columns** — Mirror/Rollup/Link column types with cross-board sync
13. **Advanced Automations v2** — 20+ triggers, 30+ actions, if/then branching, delays
14. **LLM-powered AI** — Plug OpenAI/Anthropic for natural language queries, auto-compose, smart status prediction
15. **PWA + Offline** — Service worker, manifest, IndexedDB cache

### Strategic (Ongoing)
16. **Integrations Marketplace** — Start with Slack, GitHub, Jira; build integration framework
17. **Mobile Apps** — React Native or PWA-first
18. **i18n** — Framework setup, then community translations

---

*Generated by Eden3 ⚡ — full source audit of 13 major components, 45+ API routes, 18 Prisma models, and all page routes.*
