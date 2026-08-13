# Office Agent

This package is the starting point for a business-focused office agent built on top of the Pi agent platform.

## Stage 00 status

This initial version provides the foundational package structure and a minimal office-agent runtime with:

- input/output contract types
- a lightweight OfficeAgent orchestrator
- HTML report generation
- email draft generation
- poster brief generation
- a CLI entrypoint for local testing

## Example

```bash
node dist/cli.js --demo
```

or

```bash
node dist/cli.js --input ./materials --title "Weekly report"
```

## Planned evolution

The next development phases will add:

- office document parsing
- richer HTML templates
- Flower of real Seedance image generation
- external email service integration
- web UI and approval flows
