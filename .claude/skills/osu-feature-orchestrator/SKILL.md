---
name: osu-feature-orchestrator
description: "thelounge-osu-custom development orchestrator. Coordinates all development work: new features, BanchoBot parsing fixes, settings additions, build validation, commit, and VPS deployment. Use this skill for any development request on this project — 'add feature', 'fix', 'update', 'add setting', 'check build', 'analyze Bancho log', 'deploy', 'redo', 'again'. Also triggers for winner hint work, ref helper changes, quick actions, connect form, or any osu! IRC client changes."
---

# osu-feature-orchestrator

Orchestrates all development work on thelounge-osu-custom.

**Execution mode:** Sub-agent (on-demand via Agent tool)
**Model:** opus for all Agent calls

## Phase 0: Context Check

Before starting, determine request type:

- **Feature implementation** — new code / modification → call feature-dev
- **Log analysis** — BanchoBot IRC log provided → call bancho-parser
- **Build/deploy** — build check, commit, VPS deploy → call build-qa
- **Compound** — implement then verify build → feature-dev → build-qa in sequence

Quick state check:
```bash
git status
```

## Phase 1: Execute

### Feature implementation

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Implement feature",
  prompt: """
  You are the feature-dev agent for thelounge-osu-custom.
  Read your agent definition at: /Users/hoaq/Desktop/thelounge-osu-custom/.claude/agents/feature-dev.md
  Working directory: /Users/hoaq/Desktop/thelounge-osu-custom

  Task: {user request verbatim}

  Report modified files and a summary of each change when done.
  """
)
```

### BanchoBot log analysis

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Analyze Bancho log",
  prompt: """
  You are the bancho-parser agent for thelounge-osu-custom.
  Read your agent definition at: /Users/hoaq/Desktop/thelounge-osu-custom/.claude/agents/bancho-parser.md
  Current refHelper: /Users/hoaq/Desktop/thelounge-osu-custom/client/js/helpers/refHelper.ts

  Log to analyze:
  {log content}

  Report parse success/failure, edge cases found, and fixes needed.
  """
)
```

### Build / commit / deploy

```
Agent(
  subagent_type: "general-purpose",
  model: "opus",
  description: "Build and deploy",
  prompt: """
  You are the build-qa agent for thelounge-osu-custom.
  Read your agent definition at: /Users/hoaq/Desktop/thelounge-osu-custom/.claude/agents/build-qa.md
  Working directory: /Users/hoaq/Desktop/thelounge-osu-custom

  Task: {build/commit/deploy request}

  Report build result. On failure, output the full error.
  """
)
```

### Compound (implement → build)

Run sequentially:
1. feature-dev sub-agent implements
2. After completion, build-qa sub-agent validates build
3. On build success, suggest commit

## Phase 2: Report

- Summarize each agent's result to the user
- On error: explain cause and next step
- On build success: propose commit message draft

## Error Handling

- feature-dev fails → report error, offer retry or ask user
- build-qa fails → pass build error to feature-dev for fix, then re-run build-qa
- bancho-parser finds issues → connect to feature-dev for code fix

## Test Scenarios

**Normal flow:** "fix accuracy calculation in winner hint" → feature-dev (implement) → build-qa (verify) → commit suggestion

**Error flow:** build-qa finds TypeScript error → pass error to feature-dev → fix → rebuild

## Key File Reference

| File | Purpose |
|------|---------|
| `client/js/helpers/refHelper.ts` | BanchoBot parsing + winner calculation |
| `client/js/helpers/osuApi.ts` | osu! APIv2 client |
| `client/js/helpers/osuCredentials.ts` | localStorage credential store |
| `client/js/settings.ts` | Settings defaults + types |
| `client/components/Settings/RefHelper.vue` | Ref helper settings UI |
| `client/components/OsuQuickActions.vue` | Quick action buttons |
| `client/components/Windows/Connect.vue` | Connect form + auto-connect |
| `client/js/socket-events/init.ts` | Init + routing |
| `client/js/socket-events/msg.ts` | Message receive hook |
| `client/js/router.ts` | Vue router config |
