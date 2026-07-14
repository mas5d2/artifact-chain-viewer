# Technology Artifact Graph Explorer v2

This version includes the upstream Strategy, CX, and UX definition layer.

## Run

```bash
cd artifact-graph-explorer-v2
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Added upstream artifacts

- Client / Opportunity Context
- Business Strategy Brief
- Success Measures
- Research & Evidence Summary
- Current Experience Assessment
- Audience Priorities
- Experience Architecture
- UX Definition

## Relationships

- `dependsOn`: hard sequencing prerequisite
- `informedBy`: iterative or advisory input

## Governance fields

- `requirement`: required, conditional, or not-applicable
- `evidenceLinks`: links to research, analytics, decisions, or source material
