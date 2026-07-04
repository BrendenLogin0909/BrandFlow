# BrandFlow — Permission Model

**Version:** 1.0 · **Date:** 2026-07-04
**Implementation:** [packages/shared/src/roles.ts](../packages/shared/src/roles.ts)

---

## 1. Model

**Role-based access control with capability mapping, scoped by membership.**

- A **Membership** binds `(user, organisation, clientCompany?, role)`.
- `clientCompany = null` means org-wide membership — allowed only for `AGENCY_ADMIN` (and the implicit `PLATFORM_OWNER`).
- A user may hold different roles for different clients (designer for Acme, reviewer for Borealis).
- Routes declare required **capabilities**, not roles. Roles map to capability sets in one shared constant, so adding a role never touches route code.

## 2. Roles → capabilities

| Capability | Platform Owner | Agency Admin | Client Admin | Brand Manager | Content Strategist | Designer | Reviewer | Approver | Read-only |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `org:manage` | ✅ | ✅ | — | — | — | — | — | — | — |
| `users:manage` | ✅ | ✅ | ✅¹ | — | — | — | — | — | — |
| `clients:manage` | ✅ | ✅ | — | — | — | — | — | — | — |
| `clients:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `brand:manage` | ✅ | ✅ | ✅ | ✅ | — | — | — | — | — |
| `brand:approve` (Gate 1) | ✅ | ✅ | ✅ | — | — | — | — | ✅ | — |
| `brand:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `content:generate` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `content:edit` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| `design:edit` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| `content:review` (comment, request changes) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `content:approve` (Gates 2 & 3) | ✅ | ✅ | ✅ | — | — | — | — | ✅ | — |
| `content:export` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| `content:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `assets:manage` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| `assets:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `audit:read` | ✅ | ✅ | ✅² | — | — | — | — | — | — |

¹ Client Admin manages users only within their own client company. ² Own client only.

## 3. Enforcement layers

1. **Route middleware** — resolves JWT → user → memberships; verifies the `:clientId` path param against memberships; attaches `{ tenant: { organisationId, clientCompanyId }, capabilities }` to the request. Missing membership → **404** (existence never revealed cross-tenant).
2. **Capability guard** — each route declares `requires: ['content:approve']`; checked against the membership's role for that specific client.
3. **Repository scoping** — tenant-scoped repositories inject `clientCompanyId` into every query; handlers cannot access unscoped Prisma (lint rule).
4. **Separation-of-duties option (per org setting):** the approver of Gate 3 must differ from the package's last editor. Default ON for agencies.
5. **AI prompt boundary** — `buildBrandContext` is the sole prompt data source and takes a single `clientCompanyId`; unit tests assert no other client's identifiers can flow in.

## 4. Approval gate authority

| Gate | Subject | Who may approve |
|---|---|---|
| 1 — Brand | BrandProfile | `brand:approve`: Client Admin, Approver, Agency Admin |
| 2 — Content plan | ContentCalendar | `content:approve` |
| 3 — Post/design | PostPackage + VisualPackage | `content:approve` (SoD rule applies) |

Approvals are recorded as ApprovalRecords and are immutable; reversing requires a new CHANGES_REQUESTED decision, keeping full history.

## 5. Platform owner

Operational super-role for the SaaS operator. All actions still audited; production access to tenant content requires a logged support-access reason (post-MVP: customer-visible access log).
