# Permissions Logging Implementation Plan

> Each phase below is organized as GitHub-style checklists so you can mark progress (`[x]` when complete).

## Phase 1 — Reason Tracking Foundations

- [x] Audit `src/permissions.ts` to list every decision path (loaded state, params, sub-resources, role lookup, final allow/deny).
- [x] Define a `PermDecision` union (`'allow' | 'deny' | 'indeterminate'`) and `PermReason` union with codes: `NOT_LOADED`, `MISSING_PARAMS`, `REQUIRES_SUBRESOURCE`, `INVALID_SUBRESOURCE`, `NO_ROLE`, `NOT_ALLOWED`, `ALLOWED`.
- [x] Extend internal evaluation to derive `{ decision, reason }` alongside the existing boolean result without changing the public API.
- [x] Gate the reason computation so it only runs when logging is enabled (re-use the sink flag in Phase 3 to avoid baseline overhead).
- [x] Update or add unit tests that cover all reason codes, ensuring the boolean contract stays intact.

## Phase 2 — Runtime Logging Controls

- [x] Introduce a logging configuration object (e.g., `LoggingModeConfig`) that captures `mode: 'off' | 'baseline' | 'debug'`, defaulting to `off` when omitted.
- [x] Decide where the config originates (env variable, Firestore doc, Remote Config) and document the retrieval strategy in code comments.
- [x] Ensure `PermissionService` accepts the config via constructor, merging with defaults so missing fields do not enable logging unexpectedly.
- [x] When logging is disabled (`mode === 'off'`), short-circuit before allocating log payloads or computing reasons.
- [x] Add tests (or extend existing ones) that assert logging stays dormant when the config resolves to `off`.

## Phase 3 — Event Sink Integration

- [ ] Define the `PermEventSink` interface with `isEnabled(): boolean` and `emit(evt: PermEvent): void`.
- [ ] Shape the `PermEvent` payload to include `{ decision, reason, action, resourceKey, siteId, userId?, timestamp, environment }`, leaving room for future fields (like `requestId`).
- [ ] Provide a default `NoopSink` implementation used when no sink is supplied.
- [ ] Update `PermissionService` to accept an optional sink via constructor (defaulting to `NoopSink`) and to invoke it when `sink.isEnabled()` returns true.
- [ ] Ensure `emit` calls are fire-and-forget; the service should remain synchronous for callers.

## Phase 4 — Logging Destinations & Hygiene

- [ ] Verify the external sink(s) supplied to `PermissionService` honor the synchronous `emit` contract while handling async work internally.
- [ ] Supply reference sink patterns in documentation (e.g., Firestore, `navigator.sendBeacon`) while keeping the core package agnostic about environment.
- [ ] Document that emitted events remain de-identified (no IP, UA, etc.) and describe how to toggle modes plus example sink wiring.
- [ ] Defer aggregate counters or dashboards; note in README that trend monitoring is out of scope for this iteration.
