## Unknown outcome
While building this, I found a state I could not honestly classify as failed or completed. Suppose a non-idempotent robot command is accepted, the robot may execute it, and the client loses the connection before receiving completion. After reconnect, how does Neuraverse reconcile that ambiguous outcome without either repeating physical action or silently losing it? Is that resolved through robot-side command IDs, a backend execution ledger, state reconciliation, or an operator decision?

And how do you prevent a delayed result from the previous connection or control session from overwriting the current state?

### Invariants

> A command with an external side effect must never be retried merely because its response was lost.

> A message from an expired control epoch must never mutate the current operator state.

I turn `vague requirements` into _invariants_, _observable failure cases_, and _regression tests_.
This is my engineering pattern.

