# TeamMamba vs Monday.com — Gap Analysis v3

**Date:** 2026-05-28
**Audited by:** Eden3 ⚡
**Codebase:** 173 TS/TSX files, 38 Prisma models, 77 API routes, 25 component directories

---

## What's Changed Since v2 (May 17)

The v2 analysis (May 17) scored overall parity at ~73%. Since then, the codebase has grown significantly:

| Metric | v2 (May 17) | v3 (May 28) | Change |
|---|---|---|---|
| Source files | 149 | 173 | +24 |
| Prisma models | 30+ | 38 | +8 |
| API routes | 70+ | 77 | +7 |

**Key findings from code audit:**

1. **LLM Integration — WIRED** (`src/lib/llm.ts`): Full OpenAI + Anthropic support with fallback chain. Reads `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` from env. The v2 report said "still heuristic" — this is no longer true.
2. **Email-to-Board — WIRED** (`/api/email/inbound`, `/api/boards/[id]/email-address`): Incoming email via Resend/Mailgun/Postmark webhooks. Board email address model exists.
3. **Column-Level Permissions — WIRED** (`src/lib/column-permissions.ts`, `/api/columns/[id]/permissions`): Per-column, per-role view/edit restrictions with full API.
4. **Integration Execution — WIRED** (`src/lib/integration-runners.ts`): Slack/webhook send with payload building. GitHub, Zapier, Microsoft Teams scaffolded.
5. **PWA Push Notifications — WIRED** (`/api/push/subscribe`, `push-notifications.ts`): Full push subscription flow with VAPID.
6. **Workspace Color Customization — WIRED**: Workspace-level color theming applied in sidebar/topbar.
7. **Formula Engine**: 708 lines (was 541 in v2).
8. **Doc Embedding**: API routes exist for creating/editing doc↔board embeds.

---

## Current Parity Scorecard

| Category | v2 Score | v3 Score | Monday.com | Change |
|---|---|---|---|---|
| Core Board Management | 98% | 99% | 100% | +1% |
| Views (Table/Kanban/Calendar) | 93% | 97% | 100% | +4% (keyboard shortcuts, bulk ops) |
| Views (Timeline/Gantt) | 90% | 95% | 100% | +5% |
| Column Types | 95% | 98% | 100% | +3% (all major types covered) |
| Automations | 65% | 80% | 100% | +15% (recurring, more triggers) |
| Integrations | 20% | 45% | 100% | **+25%** (Slack/webhooks execute!) |
| AI Features | 30% | 60% | 80% | **+30%** (real LLM wired!) |
| Dashboards/Charts | 85% | 90% | 100% | +5% |
| Collaboration | 90% | 95% | 100% | +5% (version history, Socket.IO) |
| Mobile/PWA | 40% | 55% | 100% | +15% (push notifications, offline) |
| Admin/Governance | 65% | 75% | 100% | +10% (column permissions, workspace color) |
| Import/Export | 85% | 95% | 100% | +10% (full Monday migration) |
| Security | 80% | 85% | 100% | +5% (column-level perms) |
| i18n | 25% | 40% | 100% | +15% (locales scaffolded, partial translations) |
| Formula Engine | 45% | 55% | 100% | +10% (708 lines, more functions) |

**Overall parity: ~73% → ~82%** (up 9 points from v2)

---

## Remaining Gaps for Commercial Viability

### 🔴 Tier 1 — Must-Have for Commercial Launch

| # | Gap | Impact | Effort | Notes |
|---|---|---|---|---|
| **A1** | **Billing & Subscriptions** | **Critical** | **L** | No Stripe/subscription model. Cannot monetize. Need: plans (Free/Pro/Enterprise), usage tracking, billing portal, trial management. Monday.com's core revenue model. |
| **A2** | **SSO / Enterprise Auth** | **Critical** | **L** | No SAML/LDAP/OAuth provider login. Enterprise buyers require SSO. Monday.com offers SAML SSO on Enterprise plan. |
| **A3** | **Native Mobile Apps** | **High** | **XL** | PWA exists but iOS/Android native apps expected. Monday.com has polished native apps. Capacitor/React Native wrap would be minimum viable. |
| **A4** | **Multi-series Charts** | **Medium** | **M** | Dashboard widgets are single-series. Need stacked/grouped bars, dual Y-axis, period comparison for competitive dashboards. |
| **A5** | **White-label Branding** | **High** | **M** | Custom logo, favicon, custom domain per workspace. Enterprise buyers expect this. Currently hardcoded TeamMamba branding. |

### 🟡 Tier 2 — Important for Competitive Parity

| # | Gap | Impact | Effort | Notes |
|---|---|---|---|---|
| **B1** | **Formula Engine v3** | Medium | L | 18→100+ functions. Missing: VLOOKUP, COUNTIF, SUMIF, ARRAY ops, date arithmetic, REGEX. 708 lines is solid but not feature-complete. |
| **B2** | **Doc↔Board Embed UI** | Medium | M | API is built but UI to create/manage embeds is incomplete. Docs need live board widgets rendered inline. |
| **B3** | **Email Digest / Notification Batch** | Medium | M | Only per-event emails. Need daily/weekly digests, per-board mute, frequency controls. |
| **B4** | **Workload Advanced** | Medium | M | Read-only grid. Need drag-to-reassign, capacity alerts, time-off tracking. |
| **B5** | **Data Governance** | Medium | M | No retention policies, auto-delete, compliance export, GDPR portability. Enterprise requirement. |
| **B6** | **Advanced Integrations** | High | XL | Slack webhooks work, but need GitHub, Jira, Salesforce, Google Workspace with OAuth + bidir sync. 2+ end-to-end integrations for marketplace credibility. |
| **B7** | **Sprint / Agile Features** | Medium | M | Sprint template exists but no velocity chart, burndown, retro board, story points. PM tools market expects this. |
| **B8** | **i18n Full Coverage** | Medium | L | Framework done, 10 locales scaffolded, but 90% UI still English. Need ~500 string extractions + translations for 5 core locales. |

### 🟢 Tier 3 — Polish & Nice-to-Have

| # | Gap | Impact | Effort | Notes |
|---|---|---|---|---|
| **C1** | **Column Summaries Footer** | Low | S | Aggregate row (SUM/AVG/COUNT/EMPTY) below table. Formula engine supports it, just needs UI. |
| **C2** | **Gantt Drag-to-Create** | Low | S | Click-drag on timeline to create items with date ranges. Currently drag-to-reschedule only. |
| **C3** | **Broadcast Messages** | Low | S | Admin announcement to all workspace members. |
| **C4** | **Quick Polls** | Low | S | Yes/no polls inside items. |
| **C5** | **Kanban Dashboard Widget** | Low | S | Embed a Kanban board as a dashboard widget. |
| **C6** | **Board Views SDK** | Medium | L | Plugin/extension system for custom views. Monday.com Dev platform. |
| **C7** | **Column Drag Reorder** | Low | S | Drag columns to reorder in table view. |
| **C8** | **PWA Install Prompt** | Low | S | "Add to Home Screen" banner flow. |
| **C9** | **Bulk Column Value Edit** | Low | S | Edit a column value for multiple selected items at once. |

---

## Commercial Viability Assessment

### TeamMamba's Strengths (vs Monday.com)
- ✅ **Self-hosted / deploy anywhere** — Monday.com is cloud-only. This is a massive differentiator for enterprises, governments, and privacy-conscious orgs.
- ✅ **Open-source core** — Transparent, auditable, community-extensible.
- ✅ **Full-stack in one repo** — No microservices complexity. Single deploy.
- ✅ **82% feature parity** — Covers the vast majority of what PM teams actually use daily.
- ✅ **Modern stack** — Next.js, Tailwind, Socket.io, Prisma. Attractive to developers.
- ✅ **Custom column types** — Formula, Connect, Mirror, Rollup — matches Monday's most powerful features.

### What's Blocking Commercial Launch

**Deal-breakers (must fix first):**
1. **No billing/subscription system** — Cannot charge users. Need Stripe integration with plan tiers.
2. **No SSO** — Enterprise buyers won't even evaluate without SAML/OAuth.
3. **No native mobile** — PBIs and PMs live on their phones. PWA is good enough for v1 but not competitive.

**Should-have before Series A / serious launch:**
4. **White-label branding** — Companies want their own logo, domain.
5. **More integrations** — 2+ working end-to-end (Slack + GitHub minimum).
6. **Data governance** — GDPR, retention, compliance export for enterprise.

### Recommended Path to Commercial Viability

**Phase 1 — MVP Launch (2-3 weeks)**
1. Stripe billing with Free/Pro/Enterprise tiers
2. Custom domain per workspace
3. White-label branding (logo + colors)
4. PWA install prompt

**Phase 2 — Enterprise Ready (4-6 weeks)**
5. SAML SSO
6. Advanced formula functions (COUNTIF, SUMIF, VLOOKUP, date math)
7. GitHub + Slack integration execution (end-to-end)
8. Email digest + notification preferences
9. Multi-series chart widgets

**Phase 3 — Competitive Parity (8-12 weeks)**
10. Native mobile app (Capacitor wrap)
11. Data governance (retention, compliance export)
12. Sprint/agile module
13. Full i18n (5 core locales)
14. Board Views SDK / plugin system
15. Expand integrations to 10+ working connections

---

## The Bottom Line

TeamMamba has the bones of a commercially viable product **today**. The feature set covers what 80%+ of PM tool users need for daily work. The architecture is clean, modern, and extensible.

**The gap isn't features — it's commercial infrastructure.** Billing, SSO, and mobile are the three blockers between "impressive open-source project" and "Monday.com alternative that companies will pay for."

The actual project management feature gap is surprisingly small. Most of the remaining PM features are Tier 2/3 polish items that can be shipped incrementally after launch. The platform is ready for beta users and design partners today, with a clear path to revenue.

---

*GAP_ANALYSIS_v3.md — Eden3 ⚡ — Full source audit of 173 TS/TSX files, 38 Prisma models, 77 API routes.*
