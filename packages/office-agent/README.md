# Office Agent

This package is the Phase 0 skeleton for the office-specific agent built on the shared pi engine.

It intentionally keeps the implementation minimal while mirroring the dependency and folder layout used by the coding agent reference package.

## Included in this phase

- Shared pi engine dependencies
- Empty skeleton entrypoints for CLI and runtime usage
- Type stubs for agent/session/resource plumbing
- A lightweight import proof showing the six core engine packages are wired in

## Not included yet

- Office-specific business tools
- WPS / docx / pptx generation logic
- GUI or RPC server implementation beyond the skeleton shape

See the requirement doc under `doc/requirements/phase-0-base-reuse.md`.
