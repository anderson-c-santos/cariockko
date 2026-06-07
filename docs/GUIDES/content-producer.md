# Content Producer Guide

**Last Updated:** 2026-06-07

The Content Producer creates lessons in three phases:

1. chat with the assistant
2. review a plan
3. generate lessons with live progress

## Entry points

- Home page CTAs: **Criar com minhas preferências** or **Gerar plano rápido**
- Sidebar: **Criar Lições**
- Route: `/create-lessons`

You can prefill the flow with query params:

- `mode=quick` or `mode=guided`
- `level=beginner|intermediate|advanced`

## Session behavior

- Each browser stores a stable session ID in `localStorage`
- Chat history is restored on reload
- The latest generation job is also restored if it is still running

## Recommended flow

### Quick mode

Use this when you want the assistant to propose a ready-to-run plan immediately.

### Guided mode

Use this when you want the assistant to ask a few short questions before proposing a plan.

### Plan review

The assistant returns a plan with:

- lesson groups
- level
- theme
- characters
- estimated time

You can edit the plan before generation starts.

## Generation

After confirmation, the UI opens an SSE stream and shows per-lesson status:

- pending
- generating
- completed
- failed

If a lesson fails, the retry action only regenerates that lesson.

## Troubleshooting

- If you see rate-limit errors, wait and retry later
- If the UI lost state, clear site data to reset the stored session ID
- If a job was interrupted by a restart, it will come back as failed and can be retried
