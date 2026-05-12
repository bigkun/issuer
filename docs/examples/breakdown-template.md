# Breakdown Template Example

This is an example custom breakdown template. Copy this file to `.issuer/templates/breakdown.md` and customize for your project.

## Task Granularity

- Each task should be completable in **1-2 days**
- If a task requires more than 2 days, split it further
- Avoid "research" or "investigation" tasks — convert to concrete deliverables

## Required Sections

Every task must include:

1. **User Story** (mandatory)
   ```
   As a [role]
   I want [feature]
   So that [benefit]
   ```

2. **Acceptance Criteria** (minimum 3)
   - Use Given-When-Then format for complex logic
   - Use checklist format for simple features

3. **Technical Notes** (optional but recommended)
   - API endpoints affected
   - Database schema changes
   - Dependencies on other tasks

## Labeling Rules

### Required Labels
- Technical stack: `frontend` | `backend` | `infra` | `mobile`
- Module: `auth` | `payment` | `user-management` | `notification`

### Optional Labels
- Priority: `quick-win` | `tech-debt` | `nice-to-have`
- Risk: `high-risk` | `experimental`

## Special Requirements

### API Tasks
- Must include OpenAPI/Swagger spec link
- Must specify request/response format
- Must include error handling scenarios

### UI Tasks
- Must include Figma/design mockup link
- Must specify responsive breakpoints
- Must include accessibility considerations (WCAG 2.1)

### Database Tasks
- Must include migration script plan
- Must specify rollback strategy
- Must include data migration plan (if applicable)

## Task Types

### Use `story` for:
- User-facing features
- New functionality
- UI/UX improvements

### Use `task` for:
- Technical work
- Refactoring
- Infrastructure changes
- DevOps tasks

### Use `bug` for:
- Defect fixes
- Regression fixes
- Performance issues

### Use `epic` for:
- Large initiatives (only when explicitly requested)
- Must contain child stories/tasks
- Max 10 child tasks per epic

## Quality Checklist

Before marking a task as complete, verify:

- [ ] User story follows standard format
- [ ] At least 3 acceptance criteria
- [ ] Technical notes included (if applicable)
- [ ] Labels applied correctly
- [ ] Task size is 1-2 days max
- [ ] Dependencies identified
- [ ] No ambiguity in requirements
