# Snap Research migration map

## Integration decision

Snap Research uses a **structured source of truth plus a compatibility projection**:

- `research_tasks` stores asynchronous workflow state and capture metadata.
- `research_cards` stores the editable, structured Evidence Card.
- a linked `sourceType: "research"` conversation is generated from the card for
  compatibility with SyncNos list, search, sync, and export flows.

The conversation projection is not the authoritative card. User judgment, evidence
links, statuses, and future edits remain in `research_cards`; the projection can be
regenerated.

This avoids both failure modes:

- forcing a structured Evidence Card into ordinary chat messages;
- rebuilding SyncNos list, search, Obsidian, Notion, Feishu, and backup capabilities
  from scratch.

## Data ownership

| Concern | Authoritative location | Existing capability reused |
| --- | --- | --- |
| Capture image and page context | `research_tasks` plus image cache | IndexedDB and local image handling |
| Job state and retry | `research_tasks` | background service worker and messaging |
| Claims, evidence, limitations | `research_cards` | new Research Core |
| User judgment | `research_cards` | new Evidence Card editor |
| Browsing/search result | generated research conversation | conversations list and search |
| Markdown / Obsidian export | generated research conversation | SyncNos export pipeline |
| Notion / Feishu sync | generated research conversation | SyncNos sync pipeline |
| Full backup | research stores plus existing stores | extend SyncNos backup manifest |

## Old Research Card web project

Source: a previous local Research Card prototype. Its machine-specific path is
intentionally omitted from repository history.

### Migrate and adapt

| Old file | New target | Action |
| --- | --- | --- |
| `lib/domain/schemas.ts` | `src/services/research/domain/schemas.ts` | Keep the core structure; narrow statuses and capture fields to the extension contract |
| `lib/ai/prompts.ts` | `src/services/research/domain/prompts.ts` | Repair corrupted Chinese strings; keep injection resistance and primary-source rules |
| `lib/ai/research-claims.ts` | `src/services/research/research-client.ts` | Remove Next.js/server coupling; call the prototype backend contract |
| `lib/evidence/rank-source.ts` | `src/services/research/domain/rank-source.ts` | Reuse tier/date ranking |
| `lib/evidence/validate-numeric-claim.ts` | `src/services/research/domain/validate-numeric-claim.ts` | Reuse numeric evidence checks |
| `lib/cards/build-card.ts` | `src/services/research/domain/build-card.ts` | Adapt to one claim and 3–5 evidence items |
| `lib/cards/output-policy.ts` | `src/services/research/domain/output-policy.ts` | Keep bounded-output behavior; repair user-facing copy |
| `lib/export/card-to-markdown.ts` | `src/services/research/domain/card-to-markdown.ts` | Make this the canonical projection formatter |
| relevant unit/eval tests | `tests/research/*` | Port before or alongside each module |

### Do not migrate

- Next.js routes and components
- Supabase clients, auth, quotas, admin, and cron code
- server-only imports
- screenshot upload lifecycle designed for hosted object storage
- web-specific job persistence
- product analytics that are not needed for the local prototype

## SyncNos changes

### Services

- Add pure Research Core under `src/services/research/domain`.
- Add a research orchestration service that accepts a capture plus optional question,
  validates the backend response, builds a card, and creates the conversation
  projection.
- Add explicit message contracts for task creation, status retrieval, retry, and card
  update.

### Platform

- Increment the IndexedDB version.
- Add `research_tasks` and `research_cards` stores with stable task/card IDs and
  status/update-time indexes.
- Extend backup export/import so the new stores are never silently omitted.
- Reuse the existing image cache by linking the generated conversation ID; do not
  duplicate large image blobs inside card JSON.

### Conversation compatibility

- Register `sourceType: "research"` before the catch-all chat kind.
- Initially reuse the article renderer for the Markdown projection.
- Give Snap Research its own Obsidian folder and destination metadata.
- Later replace the article renderer with a dedicated Evidence Card renderer; this
  must not change the stored domain model.

### UI

Only four new user-facing states are in scope:

1. region capture overlay;
2. optional one-line research question;
3. task status;
4. Evidence Card detail and judgment.

Settings, provider pickers, generic chat, standalone OCR, and a separate knowledge
base are excluded from V1.

## First implementation slice (completed)

The first vertical slice deliberately excludes live AI and screen capture:

1. introduce the Research Core schemas and Markdown formatter;
2. persist a fixture task/card;
3. generate a `research` conversation projection;
4. confirm the card appears in the existing list and exports to Markdown;
5. add the dedicated renderer only after the data route is stable.

This proved the hardest reuse boundary before UI and network work were added.
The capture UI, asynchronous backend job, dedicated judgment header, and backup
support are now implemented. See `implementation-status.md` for the current
end-to-end state and run instructions.
