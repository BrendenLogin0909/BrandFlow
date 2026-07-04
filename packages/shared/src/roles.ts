/**
 * Role → capability mapping. Routes declare required capabilities;
 * roles never appear in route code. See docs/07-permission-model.md.
 */

export const ROLES = [
  'PLATFORM_OWNER',
  'AGENCY_ADMIN',
  'CLIENT_ADMIN',
  'BRAND_MANAGER',
  'CONTENT_STRATEGIST',
  'DESIGNER',
  'REVIEWER',
  'APPROVER',
  'READ_ONLY',
] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'org:manage',
  'users:manage',
  'clients:manage',
  'clients:read',
  'brand:manage',
  'brand:approve',
  'brand:read',
  'content:generate',
  'content:edit',
  'design:edit',
  'content:review',
  'content:approve',
  'content:export',
  'content:read',
  'assets:manage',
  'assets:read',
  'audit:read',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const READ_SET: Capability[] = ['clients:read', 'brand:read', 'content:read', 'assets:read'];

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  PLATFORM_OWNER: [...CAPABILITIES],
  AGENCY_ADMIN: [...CAPABILITIES],
  CLIENT_ADMIN: [
    ...READ_SET,
    'users:manage',
    'brand:manage',
    'brand:approve',
    'content:generate',
    'content:edit',
    'design:edit',
    'content:review',
    'content:approve',
    'content:export',
    'assets:manage',
    'audit:read',
  ],
  BRAND_MANAGER: [
    ...READ_SET,
    'brand:manage',
    'content:generate',
    'content:edit',
    'design:edit',
    'content:review',
    'content:export',
    'assets:manage',
  ],
  CONTENT_STRATEGIST: [
    ...READ_SET,
    'content:generate',
    'content:edit',
    'design:edit',
    'content:review',
    'content:export',
    'assets:manage',
  ],
  DESIGNER: [...READ_SET, 'design:edit', 'content:review', 'content:export', 'assets:manage'],
  REVIEWER: [...READ_SET, 'content:review'],
  APPROVER: [...READ_SET, 'brand:approve', 'content:review', 'content:approve', 'content:export'],
  READ_ONLY: [...READ_SET],
};

export function roleHas(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}
