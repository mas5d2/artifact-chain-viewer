# Technology Artifact Graph Explorer

An interactive map of the artifacts a delivery team produces — what each one depends on, who makes it, who consumes it, and what "good" looks like — built as a zero-build static site.

It has three layers, all driven from two JSON files:

1. **Graph explorer** — visualize and traverse the dependency chain between artifacts
2. **Docs** — a generated documentation page per artifact: purpose, quality bar, template, worked examples, Definition of Ready, Definition of Done
3. **Project tracking (POC)** — track a real project's artifact status in the browser and get a computed "next best action" per role

There is no build step, no backend, and one runtime dependency (Cytoscape.js, loaded from a CDN).

## Quick start

The app fetches JSON, so it must be served rather than opened as a file:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Internet access is required for the Cytoscape CDN.

## The explorer

- **Layered layout** — each artifact is positioned left-to-right at its true dependency depth (longest prerequisite chain), so project shape is visible: parallel fan-in, a serial spine, feature-level fan-out, release convergence. A dropdown switches back to a clustered (breadthfirst) view.
- **★ Keystones** — the artifacts the whole project flows through, computed by flow centrality (upstream reach × downstream reach, marked at ≥90% of the maximum). Recomputed live from the data.
- **Hide implied edges** (default on) — hides dependency edges already implied by a longer path (transitive reduction). The relationships stay in the data and in every calculation; only the drawing is simplified.
- **Filters** — search, stage, author/owner, consumer, requirement level, and an external-inputs toggle. The author filter shows what a role produces *plus* the external inputs it owns gathering.
- **Focus** — click a node to highlight its full upstream chain (green) and downstream dependents (purple); traverse via the links in the detail panel.

## The docs

Open **Docs ↗** in the header, or the doc link on any artifact's detail panel. Every artifact page includes:

- a plain-English TL;DR and a "what good looks like" quality bar
- a **native format callout** — many artifacts are not documents (Figma files, spreadsheets, tracker tickets, runbooks); the page says so explicitly so nobody writes a redundant doc
- a **template** (table skeleton or section outline) with **two fully worked examples**, tabbed — the same two fictional projects (a credit union replatform and a post-merger hospital network) carried consistently across all 41 artifacts, so decisions can be traced from strategy to launch plan
- a **Definition of Ready generated from the graph** — the artifact's actual `dependsOn` list, with live status checkmarks if a project is being tracked
- a hand-written **Definition of Done**

Doc pages are one template ([docs/artifact.html](docs/artifact.html)) rendering entries from [docs/content.json](docs/content.json).

## Project tracking (proof of concept)

The **Project** tab in the sidebar tracks a real project against the graph, stored in `localStorage` (key `artifact-graph-project-v1`) — nothing leaves the browser.

- Mark any artifact **Not started / In progress / Done** from its detail panel. Feature-level artifacts are tracked **per feature** (add features in the Project tab).
- Readiness is computed from hard dependencies: **Safe** (all inputs done), **Conditional** (nothing upstream untouched), **Unsafe** (something upstream not started).
- **Next best action per role** — each role's best Safe (else Conditional) item, or "nothing safe to start". External inputs surface as **gather** actions for their owning role when the work waiting on them is near (≤3 steps from ready) or the input is flagged long-lead (`earlyRequest`).
- **Most wanted inputs** and **Closest to ready** show exactly what is blocking progress and what each stalled item is waiting on.

## Data model

Everything renders from [artifacts.json](artifacts.json). Edit it and the UI, docs DoR, keystones, and layouts rebuild themselves.

Each node:

| Field | Meaning |
|---|---|
| `id`, `name`, `description` | Identity |
| `type` | `artifact` or `external-input` |
| `stage` | `upstream-definition`, `project-start`, `feature-level`, `release`, or `external` |
| `author` | Roles that produce it |
| `owner` | (externals) the internal role responsible for gathering it |
| `earlyRequest` | (externals) long-lead input — chase it as soon as anything wants it |
| `source` | Where its content comes from |
| `neededBy` | Roles that consume it |
| `dependsOn` | Hard prerequisites — drives edges, readiness, DoR |
| `informedBy` | Iterative/advisory input; influences without enforcing sequence |
| `requirement` | `required`, `conditional`, or `not-applicable` |
| `evidenceLinks` | Links to research, analytics, or decisions |

Graph edges, dependency depth, keystone status, and implied-edge detection are all **derived** — never stored.

Doc content lives in [docs/content.json](docs/content.json), one entry per artifact id:

```jsonc
{
  "artifact_id": {
    "tldr": "…",
    "good": ["…"],
    "medium": { "label": "Figma file", "doc": false, "note": "…" },
    "template": { "type": "table" | "outline", "columns"/"sections": […], "rows": […] },
    "examples": [ { "name": "…", "rows"/"sections": […] }, … ],
    "dorExtra": ["…"],
    "dod": ["…"]
  }
}
```

Outline sections accept a string (paragraph) or an array (rendered as a list; numbered items become an ordered list). An artifact without a content entry still gets a working doc page — summary and DoR are generated from the graph.

## Adapting it to your organization

1. Replace the nodes in `artifacts.json` with your artifacts, stages, and roles — the filters, roles, keystones, and layouts are all data-driven.
2. Rewrite `docs/content.json` entries as you go; undocumented artifacts degrade gracefully.
3. The two worked examples are fictional. Keep the pattern (two contrasting projects, carried consistently) — it's what makes the docs teach instead of decorate.

## Files

```
index.html           Explorer shell, styles, filters
app.js               Graph, layouts, readiness/NBA logic, project tracking
artifacts.json       The graph: artifacts, external inputs, relationships
docs/index.html      Docs index, grouped by stage
docs/artifact.html   Doc page template (renders any artifact by ?id=)
docs/content.json    Hand-written doc content: TL;DRs, templates, examples, DoDs
```
