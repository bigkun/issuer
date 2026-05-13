// ---------------------------------------------------------------------------
// Core constants for the issuer CLI
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Yunxiao (Alibaba Cloud DevOps) platform constants
// ---------------------------------------------------------------------------

/** Default API domain for Center edition */
export const YUNXIAO_DEFAULT_DOMAIN = 'openapi-rdc.aliyuncs.com';

/** API version prefix */
export const YUNXIAO_API_VERSION = 'v1';

/** Base API path */
export const YUNXIAO_API_BASE = '/oapi';

/** Projex (project management) API prefix */
export const YUNXIAO_PROJEX_API_PREFIX = '/oapi/v1/projex';

/** Authentication header name */
export const YUNXIAO_AUTH_HEADER = 'x-yunxiao-token';

/** Workitem categories supported by Yunxiao */
export const YUNXIAO_WORKITEM_CATEGORIES = ['Req', 'Bug', 'Task'] as const;

/** Default page size for pagination */
export const YUNXIAO_DEFAULT_PAGE_SIZE = 200;

/** Base URL for Yunxiao DevOps web interface */
export const YUNXIAO_DEVOPS_BASE_URL = 'https://devops.aliyun.com';

// ---------------------------------------------------------------------------
// GitLab platform constants
// ---------------------------------------------------------------------------

/** Default GitLab instance host */
export const GITLAB_DEFAULT_HOST = 'https://gitlab.com';

// ---------------------------------------------------------------------------
// Priority and severity keyword mappings
// ---------------------------------------------------------------------------

/** Keywords used to match priority levels from API responses */
export const PRIORITY_KEYWORDS: Record<string, string[]> = {
  critical: ['紧急', 'critical', 'urgent', 'p0'],
  high: ['高', 'high', 'p1'],
  medium: ['中', 'medium', 'normal', 'p2'],
  low: ['低', 'low', 'p3'],
};

/** Keywords used to match severity levels from API responses */
export const SEVERITY_KEYWORDS: Record<string, string[]> = {
  critical: ['致命', 'critical', 'block'],
  high: ['严重', 'high', 'major'],
  medium: ['一般', 'medium', 'normal'],
  low: ['建议', 'low', 'minor'],
};

// ---------------------------------------------------------------------------
// Default MCP capabilities
// ---------------------------------------------------------------------------

/** Default MCP capabilities when no registry entry or probe is available */
export const DEFAULT_MCP_CAPABILITIES = {
  create: true,
  update: true,
  search: true,
  read: true,
  comment: true,
} as const;

// ---------------------------------------------------------------------------
// Remote issue states
// ---------------------------------------------------------------------------

/** Remote issue open state */
export const REMOTE_STATE_OPEN = 'open';

// ---------------------------------------------------------------------------
// CLI prompt options
// ---------------------------------------------------------------------------

/** Prompt option: upload duplicates */
export const PROMPT_OPTION_UPLOAD = '1';

/** Prompt option: skip duplicates */
export const PROMPT_OPTION_SKIP = '2';

/** Prompt option: cancel */
export const PROMPT_OPTION_CANCEL = '3';
