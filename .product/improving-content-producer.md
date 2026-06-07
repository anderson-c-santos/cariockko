# Product Improvement Request
## Feature: Interactive Content Producer Agent
**Product:** Cariockko
**Author:** Product Management
**Status:** Draft
**Date:** 2026-06-06

---

## 1. Background & Motivation

The current Content Producer works as a rigid background process: it generates a fixed set of 60 lessons (20 per difficulty level) at first startup and is tightly coupled with the application boot sequence. This creates several problems:

- **Coupling risk:** The app waits for lesson seeding to complete before becoming usable, meaning a generation failure during startup can block the entire application from opening.
- **No personalisation:** All users receive the same pre-generated lessons, regardless of their interests, learning goals, or pace.
- **No user agency:** Users have no visibility into the content generation process and no way to influence it.
- **Wasted generation:** A significant portion of the 60 lessons may never be opened by a given user.

This request proposes decoupling the Content Producer from the startup flow and evolving it into an interactive, user-facing feature — a conversational AI assistant that generates lessons tailored to each user's preferences, on demand.

---

## 2. Goals

- Allow the application to start with zero pre-seeded lessons.
- Give users the ability to create lessons that match their personal interests and learning objectives.
- Make the content creation process transparent, predictable, and recoverable.
- Prevent the Content Producer from being misused for purposes outside its defined scope.

---

## 3. Proposed Solution

### 3.1 Overview

The Content Producer becomes a **standalone tab** within the application, presenting a chat-style interface — consistent with familiar AI assistant patterns — where users can request and customise lessons before they are created. Generation only happens after explicit user confirmation.

The app can launch with an empty lesson library. Users populate it themselves through the Content Producer, either using quick-start templates or through a guided conversation.

---

### 3.2 Two Interaction Modes

#### Mode A — Quick Start (Template-driven)

A pre-filled prompt template is displayed in the interface:

> *"Generate X generic lessons for me."*

When the user taps this template:
1. The agent asks only one clarifying question: **how many lessons per level** the user wants.
2. Upon receiving an answer, the agent enters **Plan Mode** (see §3.3) and presents the lesson plan for confirmation.
3. After the user confirms, generation begins.

This path is designed for users who want to get started quickly without customisation.

#### Mode B — Custom Request (Free conversation)

Users with specific preferences can freely interact with the Content Producer in natural language. Examples of valid inputs:

- *"Create 5 beginner lessons about ordering food at a restaurant."*
- *"I work in tech — make intermediate lessons about job interviews."*
- *"I'm a football fan. Make advanced lessons using sports vocabulary."*

The agent gathers the user's preferences through conversation, then enters **Plan Mode** before creating anything.

---

### 3.3 Plan Mode (Mandatory Pre-generation Step)

Before executing any lesson generation, the Content Producer **must** present a lesson plan to the user and wait for explicit approval. This applies to both interaction modes.

The plan should include:

| Field | Example |
|---|---|
| Number of lessons | 5 |
| Difficulty level(s) | Beginner |
| Theme / context | Ordering food at a restaurant |
| Characters | Aimee & Todd |
| Estimated generation time | ~2 minutes |

The user sees two options: **Confirm & Generate** or **Edit Plan**. Generation does not start until the user confirms.

This step ensures users are never surprised by the content that gets created and reduces wasted API calls from misunderstood instructions.

---

### 3.4 Generation Progress & Status Feedback

Once generation starts, the interface must provide **clear, real-time visibility** into the process. Specifically:

- A progress indicator showing how many lessons have been created vs. the total requested (e.g., "3 of 5 lessons created").
- Individual lesson statuses: pending → generating → completed / failed.
- If one or more lessons fail mid-way, the interface must:
  - Clearly identify which lessons failed and why (e.g., "Lesson 4 failed: API timeout").
  - Offer a **Retry** action for failed lessons without restarting successful ones.
  - Never silently discard partial results.

Users should be able to navigate away from the Content Producer tab while generation runs in the background, and return to see the updated status.

---

### 3.5 Guardrails

The Content Producer must reject out-of-scope requests and redirect the user appropriately. Examples of what should be blocked:

- General English grammar questions (*"Can you explain the past perfect tense?"*)
- Translation requests (*"How do you say X in English?"*)
- Requests unrelated to lesson creation (*"Write me a poem."*)

When a guardrail is triggered, the agent should respond clearly and helpfully, for example:

> *"I'm here to help you create new lessons for Cariockko. For grammar questions, try practicing with one of your existing lessons! Would you like me to create lessons focused on [relevant topic]?"*

Guardrails must be defined and documented so they can be iterated on over time.

---

## 4. User Experience Flow

```
User opens "Create Lessons" tab
        │
        ▼
Content Producer chat interface loads
        │
        ├── [Template path] User taps "Generate X generic lessons"
        │       └── Agent asks: "How many lessons per level?"
        │               └── User answers
        │
        ├── [Custom path] User types a free-form request
        │       └── Agent may ask 1–2 clarifying questions
        │
        ▼
[PLAN MODE] Agent presents lesson plan summary
        │
        ├── User selects "Edit Plan" → back to conversation
        │
        └── User selects "Confirm & Generate"
                │
                ▼
        Generation starts — progress shown in real time
                │
                ├── All lessons succeed → lessons appear in library
                │
                └── Some lessons fail → failed items shown with Retry option
```

---

## 5. Scope & Boundaries

| In Scope | Out of Scope |
|---|---|
| Decoupling lesson seeding from app startup | Changes to the lesson player or speaking tutor |
| New "Create Lessons" tab in the navigation | Account system or cloud sync for generated lessons |
| Template-based quick start | Lesson editing or deletion via the Content Producer |
| Free-text conversation with the agent | Audio pre-generation at request time (can remain async) |
| Plan Mode with user confirmation | Multi-language support beyond Brazilian Portuguese UI |
| Progress feedback and error recovery | |
| Guardrails for out-of-scope requests | |

---

## 6. Open Questions

1. **Session persistence:** Should lessons generated in one session persist across devices, or remain local as the current progress tracking does?
2. **Guardrail enforcement:** Should guardrails be implemented via a system prompt, a classifier, or a combination of both? Who owns ongoing maintenance?
3. **Empty state:** What does a new user see in the lesson library before generating any lessons? Is there a default set of "sample" lessons pre-loaded, or is the library truly empty?
4. **Retry granularity:** On partial failure, should the system retry individual exchanges within a lesson, or re-generate the entire lesson from scratch?
5. **Generation quotas:** Should there be a limit on the number of lessons a user can generate per session or in total, to manage API costs?

---

## 7. Success Metrics

| Metric | Target |
|---|---|
| App startup time (P95) | Reduced vs. current baseline (no seeding delay) |
| Content Producer session completion rate | ≥ 60% of sessions that enter Plan Mode result in confirmed generation |
| Lesson generation success rate | ≥ 95% of individual lessons created without error |
| Out-of-scope message rate | < 10% of Content Producer messages trigger a guardrail |
| User-generated lesson play rate | ≥ 70% of generated lessons opened at least once |
