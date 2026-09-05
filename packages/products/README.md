# @nafa/products — Product Master

The shared vocabulary of tradeable agricultural products.

A product here is the tradeable species itself — Riz, Anacarde, Fonio —
not a variety, not a lot, not an offer. Product Master owns the reference
data: codes, official names plus local aliases, generic categories, and
the units of measure with their metric conversions. Everything else lives
in its own bounded context (ADR-0010).

**Layer** `layer:domain` · **Scope** `scope:product` · depends on `@nafa/shared` only.

- `src/` — the domain (aggregate, value objects, events, services, ports)
- `docs/adr/0010-product-master-boundaries.md` — what belongs here, what does not
- `docs/backlog/PROD-001.md` — the sprint breakdown
