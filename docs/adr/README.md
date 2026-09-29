# Architecture decision records

One file per decision made about this component. An ADR records *why* a choice
was made, so nobody has to reverse-engineer the reasoning from the code — or
worse, undo it without knowing what it was for.

| ADR | Decision |
| --- | --- |
| [0001](./0001-relay-stamps-from-received-at-sequence.md) | The relay stamps `from`, `receivedAt` and `sequence`, and its clock is the authority |
| [0002](./0002-invalid-message-closes-connection.md) | An invalid message closes the connection, with a reason |
| [0003](./0003-resume-by-sequence-dedupe-by-id.md) | Resume by sequence, dedupe by envelope id |
| [0004](./0004-consume-protocol-as-pinned-git-dependency.md) | Consume the protocol as a pinned git dependency, through its own checker |

The wire decisions these build on are in `deskaway-protocol/docs/adr/`.

## Format

Copy `0000-template.md`. Five short sections, in this order:

1. **Status** — `Proposed`, `Accepted`, or `Superseded by NNNN`.
2. **Context** — what forced a decision. The constraint, not the conclusion.
3. **Decision** — what you chose, plainly.
4. **Rejected options** — what else you considered, and why not. **This section is
   the point.** A decision with no rejected options reads like a preference. With
   them, it reads like engineering.
5. **Consequences** — what this makes easy, and what it makes hard or impossible
   later.

Every ADR is dated.

## Naming

`NNNN-short-slug.md`, numbered sequentially from `0001` — for example
`0003-wpf-over-winui.md`. Numbers are never reused, even for a rejected ADR.

## When to write one

**At the moment of deciding.** Not a week later.

This is the one rule worth being strict about: a week later you will remember what
you chose, but not what you rejected or why — and the rejected options were the
point. If you are choosing between two libraries with a browser full of tabs, that
is the moment the file is cheap to write and most valuable.

## What belongs here

A decision that constrains this component and would be expensive to reverse: a
storage choice, a concurrency model, a dependency that is hard to remove, a
framework, a deliberate limitation.

A decision constraining **more than one** repo belongs in
[deskaway-docs](https://github.com/away-desk/deskaway-docs) instead — a wire
contract change, or a rule about how components may talk to each other. When in
doubt, ask whether another repo's author needs to read it.

Not an ADR: anything you would happily change next week, and anything already
obvious from the code.

## Never edit an old one

**Do not edit an accepted ADR to change the decision.** It records what was
decided and what was known then — not the current state of the system. Those drift
apart, and that is correct.

Changed your mind? Write a new ADR. Set the old one's status to
`Superseded by NNNN` with a link, and link back from the new one. The history of a
reversed decision is usually more useful than the decision itself: it shows what
you learned in between.

Fixing a typo is fine. Rewriting the reasoning is not.
