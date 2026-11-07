# Canonical Engineering Workspace — local-mcp-memory

The `.workspace/` directory serves as the canonical engineering workspace for **local-mcp-memory** (v2.6.0).
It contains all human-facing and agent-facing engineering records, architectural specifications, campaign reports, deep resources, and historical indices.

## Directory Structure
```
.workspace/
├── README.md                 # This overview
├── INDEX.md                  # Master index of engineering assets
├── decisions/                # Architecture Decision Records (ADRs)
├── specifications/           # Formal technical specifications
├── plans/                    # Release and migration execution plans
├── reports/                  # All Campaign and Audit Reports (Sole Canonical Source)
├── resources/                # Deep technical documentation and conceptual guides
├── templates/                # Engineering document templates
├── archive/                  # Historical and superseded artifacts
├── PRI/                      # Project Reference Index
└── LFI/                      # Logic Flow Index
```

## Placement Rules
1. **Reports:** All campaign reports, audit logs, release evaluations, and migration integrity evidence MUST be stored in `.workspace/reports/<CampaignName>/`. The legacy root `.reports/` directory has been deprecated and permanently consolidated here.
2. **Resources:** Deep domain and architectural articles live in `.workspace/resources/`.
3. **Decisions:** Architecture decisions must be recorded using `.workspace/templates/ADR_TEMPLATE.md` in `.workspace/decisions/`.
4. **Specifications:** System designs and protocols live in `.workspace/specifications/`.
5. **Plans:** Actionable milestone and migration plans live in `.workspace/plans/`.
