# ClientFlow V1.0 — Master Development Instructions

You are acting as the senior software engineer responsible for building ClientFlow V1.0.

ClientFlow is a production-quality portfolio project demonstrating the ability to build a real-world small-business SaaS application.

## Product

ClientFlow is a lightweight CRM and project management platform for freelancers and small agencies.

The primary workflow is:

User → Client → Project → Task → Dashboard

The application must support:

- Authentication

- Client management

- Project management

- Task management

- Revenue tracking

- Dashboard analytics

- Multi-user data isolation

- Demo mode

## Technology Stack

Use:

- Next.js

- TypeScript

- Tailwind CSS

- shadcn/ui

- Supabase

- PostgreSQL

- Supabase Authentication

- PostgreSQL Row Level Security

- Vitest

- Playwright

- GitHub Actions

- Vercel

Do not introduce additional infrastructure unless there is a concrete technical requirement.

Specifically avoid unnecessary:

- Microservices

- Redux

- GraphQL

- Redis

- Docker

- WebSockets

- CQRS

- Event buses

- complex abstraction layers

The architecture should remain understandable by a single developer.

## Core Data Model

Entities:

Profile  
Client  
Project  
Task

Relationships:

User 1 Clients

User 1 Projects

User 1 Tasks

Client 1 Projects

Project 1 Tasks

All tenant-owned tables must contain user_id.

All tenant-owned data must be protected using PostgreSQL Row Level Security.

A user must never be able to access another user's data.

Do not rely only on frontend filtering for authorization.

## Project Status

Supported values:

planning

in_progress

on_hold

completed

cancelled

## Task Status

Supported values:

todo

in_progress

done

## Task Priority

Supported values:

low

medium

high

Use database constraints where appropriate.

## Revenue

Completed Revenue:

SUM(project.value)  
WHERE project.status = completed

Pipeline Value:

SUM(project.value)  
WHERE project.status != cancelled

Do not implement accounting, invoices, payment processing, tax calculations, or accounts receivable in V1.0.

## Project Progress

Project progress is calculated from tasks:

completed tasks / total tasks × 100

Handle projects with zero tasks correctly.

## Required Pages

/login

/dashboard

/clients

/clients/[id]

/projects

/projects/[id]

/tasks

/settings

## Dashboard

Display:

- Completed Revenue

- Total Clients

- Active Projects

- Open Tasks

- Recent Projects

- Upcoming Deadlines

## Quality Requirements

The application must include:

- Type safety

- Input validation

- Authentication

- Authorization

- Row Level Security

- Error handling

- Loading states

- Empty states

- Responsive layouts

- Accessible forms and controls

- Unit tests

- Integration tests

- Critical-path E2E tests

No secrets may be committed to the repository.

Provide .env.example.

## Development Process

Development is divided into seven phases.

Phase 0:  
Architecture and project setup.

Phase 1:  
Authentication, profiles, protected routes, and RLS.

Phase 2:  
Client management.

Phase 3:  
Project management.

Phase 4:  
Task management and project progress.

Phase 5:  
Dashboard and revenue calculations.

Phase 6:  
Demo mode, responsive polish, accessibility, security review, testing, CI, documentation, screenshots, and deployment readiness.

Do not implement future phases prematurely.

At the beginning of each phase:

1. Inspect the existing repository.

2. Explain the implementation plan.

3. Identify files that will be created or modified.

4. Identify database changes.

5. Identify risks.

6. Do not modify code until the plan is internally consistent.

During implementation:

- Make small, logically grouped changes.

- Preserve existing working behavior.

- Do not rewrite working modules unnecessarily.

- Avoid duplicated business logic.

- Keep business logic testable.

- Validate user-controlled input.

- Enforce authorization server-side and in the database.

- Do not expose service-role credentials to the client.

At the end of every phase:

Run all relevant:

- lint

- type checking

- unit tests

- integration tests

- E2E tests where applicable

- production build

Then provide:

1. Summary of implementation

2. Files added

3. Files modified

4. Database migrations

5. Tests added

6. Test results

7. Known limitations

8. Security considerations

9. Remaining work

10. Confirmation that no unrelated functionality was changed

Never claim that a test passed unless it was actually executed successfully.

Never silently remove a test to make the suite pass.

Never weaken validation, authentication, authorization, RLS, or tests merely to resolve a failure.

If a requirement is ambiguous, choose the simplest implementation consistent with the V1.0 product scope and document the decision.

The goal is not maximum feature count.

The goal is a small, maintainable, secure, polished SaaS application that can be confidently demonstrated to potential freelance clients.
