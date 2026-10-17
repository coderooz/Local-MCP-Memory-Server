# PRI/LFI Flow Visualizer

## Master Flow — Agent Decision Architecture

```mermaid
flowchart TD
    A[Agent Session Start] --> B[Read AGENTS.md]
    B --> C{Governance Files Exist?}
    C -->|Yes| D[Load GOVERNANCE.md]
    C -->|No| E[Log Warning]
    D --> F[Load AGENT_RULES.md]
    F --> G[Load PROJECT_WORKFLOW.md]
    G --> H[Load WORKFLOW_STANDARDS.md]
    H --> I[Load ENFORCEMENT.md]
    I --> J{PRI/LFI Exist?}
    J -->|Yes| K[Read PRI]
    J -->|No| L[Create PRI]
    K --> M[Read LFI]
    M --> N[Task Understanding]
    N --> O[Execute Task]
    O --> P[Update PRI/LFI]
    P --> Q[Store Context]
    Q --> R[Record Activity]
    R --> S[Session End]
    L --> T[Inspect Project]
    T --> U[Create PRI]
    U --> V[Create LFI]
    V --> N
```

## PRI Lifecycle — Structural Reference Creation

```mermaid
flowchart TD
    A[Stage 0: Determine Scope] --> B[Stage 1: Project Discovery]
    B --> C[Inspect Git State]
    C --> D[Inspect Project Structure]
    D --> E[Read Existing Documentation]
    E --> F{PRI Exists?}
    F -->|Yes| G[Read Existing PRI]
    F -->|No| H[Create New PRI]
    G --> I[Validate PRI Against Project]
    I --> J{Changes Needed?}
    J -->|Yes| K[Update PRI]
    J -->|No| L[Use Existing PRI]
    H --> M[Capture Tech Stack]
    M --> N[Capture Directory Structure]
    N --> O[Capture Configuration]
    O --> P[Capture Dependencies]
    P --> Q[Capture Build System]
    Q --> R[Capture Testing Framework]
    R --> S[Capture Documentation System]
    S --> T[Generate PRI]
    T --> U[Save to .workspace/PRI/]
    K --> U
    U --> V[Cross-Reference LFI]
    V --> W[Stage 2: Baseline]
```

## LFI Lifecycle — Behavioral Reference Creation

```mermaid
flowchart TD
    A[After PRI Created] --> B[Analyze Source Code]
    B --> C[Identify Core Modules]
    C --> D[Trace Execution Paths]
    D --> E[Map Component Interactions]
    E --> F[Identify Error Paths]
    F --> G[Create Mermaid Diagrams]
    G --> H[Document Error Scenarios]
    H --> I[Create COMPONENT_INTERACTIONS.md]
    I --> J[Create ERROR_PATHS.md]
    J --> K[Create DIAGRAMS.md]
    K --> L[Create LOGIC_FLOW_INDEX.md]
    L --> M[Save to .workspace/LFI/]
    M --> N[Cross-Reference PRI]
    N --> O[Validate All Files]
    O --> P[End]
```

## Task Execution Flow — Agent Workflow

```mermaid
flowchart TD
    A[New Task] --> B[Read PRI/LFI]
    B --> C[Understand Project Context]
    C --> D[Plan Compliance]
    D --> E[Execute Task]
    E --> F[Validate Changes]
    F --> G{Changes Affect Behavior?}
    G -->|Yes| H[Update LFI]
    G -->|No| I{Changes Affect Structure?}
    H --> J[Update PRI]
    I -->|Yes| J
    I -->|No| K[Store Context]
    J --> K
    K --> L[Record Activity]
    L --> M[Task Complete]
```

## Cross-Reference Validation Flow

```mermaid
flowchart TD
    A[Start Validation] --> B[Read PRI]
    B --> C[Read LFI]
    C --> D[Compare PRI Against Project]
    D --> E[Compare LFI Against Behavior]
    E --> F{Inconsistencies?}
    F -->|Yes| G[Identify Root Cause]
    G --> H[Update Inconsistent File]
    H --> I[Re-validate]
    F -->|No| J[Check Cross-References]
    J --> K{PRI References LFI?}
    K -->|Yes| L{LFI References PRI?}
    K -->|No| M[Add LFI Reference to PRI]
    L -->|Yes| N[Validation Complete]
    L -->|No| O[Add PRI Reference to LFI]
    M --> L
    O --> L
```

## Error Recovery Flow — When Validation Fails

```mermaid
flowchart TD
    A[Validation Failed] --> B[Analyze Error Type]
    B --> C{Error Category?}
    C -->|Structural| D[Check File Existence]
    C -->|Behavioral| E[Check Code Against Diagrams]
    C -->|Cross-Reference| F[Check Reference Paths]
    D --> G{File Exists?}
    G -->|Yes| H[Validate Content]
    G -->|No| I[Recreate File]
    E --> J{Code Matches Diagrams?}
    J -->|Yes| K[Update Diagrams]
    J -->|No| L[Investigate Code Change]
    F --> M{Paths Correct?}
    M -->|Yes| N[Update References]
    M -->|No| O[Fix Reference Paths]
    H --> P[Re-validate]
    I --> P
    K --> P
    L --> P
    N --> P
    O --> P
```

## Development Team Access Points

```mermaid
flowchart TD
    A[Developer Starts Work] --> B[Check Project AGENTS.md]
    B --> C{PRI/LFI Instructions?}
    C -->|Yes| D[Read PRI]
    C -->|No| E[Manual Discovery]
    D --> F[Understand Project Structure]
    F --> G[Read LFI]
    G --> H[Understand Project Behavior]
    H --> I[Plan Changes]
    I --> J[Execute Changes]
    J --> K[Update PRI/LFI]
    K --> L[Commit Changes]
    E --> M[Inspect Project]
    M --> N[Create Notes]
    N --> O[Execute Changes]
    O --> P[Update Documentation]
```

## Governance Enforcement Flow

```mermaid
flowchart TD
    A[Enforcement Check] --> B[Read GOVERNANCE.md]
    B --> C[Read AGENT_RULES.md]
    C --> D[Read ENFORCEMENT.md]
    D --> E[Check PRI/LFI Existence]
    E --> F{PRI Exists?}
    F -->|Yes| G[Check PRI Version]
    F -->|No| H[Flag Violation]
    G --> I{Version Current?}
    I -->|Yes| J[Check LFI]
    I -->|No| K[Update PRI]
    J --> L{LFI Exists?}
    L -->|Yes| M[Check LFI Version]
    L -->|No| N[Flag Violation]
    M --> O{Version Current?}
    O -->|Yes| P[Enforcement Pass]
    O -->|No| Q[Update LFI]
    H --> R[Report to User]
    N --> R
    K --> S[Continue Workflow]
    Q --> S
```

## Quick Reference — File Locations

| File                         | Location          | Purpose                           |
| ---------------------------- | ----------------- | --------------------------------- |
| `PROJECT_REFERENCE_INDEX.md` | `.workspace/PRI/` | Structural map of the project     |
| `LOGIC_FLOW_INDEX.md`        | `.workspace/LFI/` | Behavioral map of the project     |
| `DIAGRAMS.md`                | `.workspace/LFI/` | Visual Mermaid diagrams           |
| `COMPONENT_INTERACTIONS.md`  | `.workspace/LFI/` | Component dependency maps         |
| `ERROR_PATHS.md`             | `.workspace/LFI/` | Error scenario documentation      |
| `FLOW_VISUALIZER.md`         | `.workspace/LFI/` | This file — visual flow reference |
