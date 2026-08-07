// Central place for role names, status values and role hierarchy rules.
// Keeping these as constants avoids typo bugs when checking roles in controllers.

const ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  REGIONAL_MANAGER: 'RegionalManager',
  BRANCH_HEAD: 'BranchHead',
  TECHNICIAN: 'Technician',
  SALESPERSON: 'Salesperson',
};

// Prefix used when auto-generating human readable User IDs, e.g. RM-0001
const ROLE_PREFIX = {
  [ROLES.SUPER_ADMIN]: 'SA',
  [ROLES.REGIONAL_MANAGER]: 'RM',
  [ROLES.BRANCH_HEAD]: 'BM', // "Branch Manager" - internal role key stays BranchHead for DB compatibility
  [ROLES.TECHNICIAN]: 'TC',
  [ROLES.SALESPERSON]: 'SP',
};

// Roles that are allowed to self-register through the public registration form.
// Super Admin is never created through public registration - only via the seed script
// or by another existing Super Admin.
const SELF_REGISTERABLE_ROLES = [
  ROLES.REGIONAL_MANAGER,
  ROLES.BRANCH_HEAD,
  ROLES.TECHNICIAN,
  ROLES.SALESPERSON,
];

// Roles that add customer visit data
const DATA_ENTRY_ROLES = [ROLES.TECHNICIAN, ROLES.SALESPERSON];

const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const VISIT_TYPE = {
  INSTALLATION: 'Installation',
  SERVICE: 'Service',
};

// Defines which role can approve which other role, and the scope (zone/branch) that applies.
// SuperAdmin can approve everyone regardless of zone/branch (global override).
const APPROVAL_RULES = {
  [ROLES.SUPER_ADMIN]: {
    canApprove: [ROLES.REGIONAL_MANAGER, ROLES.BRANCH_HEAD, ROLES.TECHNICIAN, ROLES.SALESPERSON],
    scope: 'global',
  },
  [ROLES.REGIONAL_MANAGER]: {
    canApprove: [ROLES.BRANCH_HEAD, ROLES.TECHNICIAN, ROLES.SALESPERSON],
    scope: 'zone',
  },
  [ROLES.BRANCH_HEAD]: {
    canApprove: [ROLES.TECHNICIAN, ROLES.SALESPERSON],
    scope: 'branch',
  },
};

// Defines which role can CRUD which other role, and scope - mirrors approval rules
const MANAGE_RULES = APPROVAL_RULES;

module.exports = {
  ROLES,
  ROLE_PREFIX,
  SELF_REGISTERABLE_ROLES,
  DATA_ENTRY_ROLES,
  STATUS,
  VISIT_TYPE,
  APPROVAL_RULES,
  MANAGE_RULES,
};
