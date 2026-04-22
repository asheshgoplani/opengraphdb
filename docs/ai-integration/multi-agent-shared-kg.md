# Multi-agent shared knowledge graph

**Status:** stub — detailed walkthrough lands in a follow-up slice.

## What this pattern is

Three (or more) agent processes open the same `.ogdb` file. One writes new
facts, one summarises, one re-ranks. MVCC snapshot isolation means every
agent sees a consistent view of the graph without blocking the others.

## Why use OpenGraphDB here

- Single-file model: no separate server to stand up for multi-process access.
  `Database::open("shared.ogdb")` Just Works across processes.
- MVCC: writers never block readers, readers never see torn state.
- WAL: a crash mid-write loses only uncommitted transactions; the other
  agents continue from the last committed snapshot.

## Reference snippet

See `AIIntegrationSection.tsx` pattern 4 (landing page).

## Related

- `ARCHITECTURE.md` §6 — transactions, MVCC
- `ARCHITECTURE.md` §7 — WAL and recovery
