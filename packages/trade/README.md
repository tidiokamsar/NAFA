# @nafa/trade — Trade Master

Offers: the first business process over the three reference Masters.

An offer is a seller proposing a quantity of a product at a unit price,
available over a window, optionally located. It is not an order, not a
transaction, not a market cotation — the boundaries are fixed in
ADR-0011.

**Layer** `layer:domain` · **Scope** `scope:trade` · depends on `@nafa/shared`
plus the three reference Masters (`@nafa/foundation`, `@nafa/geography`,
`@nafa/products`) — type imports only, every edge named in ADR-0011.

- `src/` — the domain (aggregate, value objects, events, ports)
- `docs/adr/0011-trade-master-boundaries.md` — what belongs here, what does not
- `docs/backlog/TRA-001.md` — the sprint breakdown
