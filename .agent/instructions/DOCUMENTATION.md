# Documentation Standards & Placement Rules

## Canonical Placement
- **Reports:** All campaign reports, audit logs, and release evaluations MUST be placed in `.workspace/reports/<Category>/`.
- **Deep Technical Reference:** In-depth architectural guides, domain models, and conceptual papers live in `.workspace/resources/`.
- **Decisions:** Architectural Decision Records live in `.workspace/decisions/`.
- **Specifications:** Technical specifications live in `.workspace/specifications/`.
- **Agent Context:** Real-time instructions, maps, and state live in `.agent/`.
- **Public & User Docs:** High-level user guides and GitHub Pages live in `docs/`.

## Prohibited Patterns
- Never create ad-hoc root-level report folders (e.g. `.reports/` is deprecated and consolidated into `.workspace/reports/`).
- Never duplicate rules between root bootstrap files; root bootstrap files must point to `.agent/`.
