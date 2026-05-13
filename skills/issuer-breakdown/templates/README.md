# Platform Issue Templates

Best practice templates for each platform's work items, serving as reference for the issuer-breakdown skill and developers.

## Platform Overview

| Platform | Work Item Types                                | Type Distinction         | Template File             |
|----------|------------------------------------------------|--------------------------|---------------------------|
| GitHub   | Issue (single type)                            | Labels: `type:bug`, etc. | [github.md](github.md)    |
| GitLab   | Issue / Epic / Task / OKR (17.10+)             | Labels + Quick Actions   | [gitlab.md](gitlab.md)    |
| Yunxiao  | Requirement (Req) / Bug / Task / Theme         | Native type distinction  | [yunxiao.md](yunxiao.md)  |

## issuer Type Mapping

issuer uses a unified `type` field; each platform adapter handles the mapping:

| issuer `type` | GitHub label     | GitLab label         | Yunxiao category |
|---------------|------------------|----------------------|------------------|
| `bug`         | `type:bug`       | `type::bug`          | `Bug`            |
| `story`       | `type:feature`   | `type::feature`      | `Req`            |
| `task`        | `type:chore`     | `type::maintenance`  | `Task`           |
| `epic`        | `type:epic`      | `type::epic`         | Theme (custom)   |

## Template Design Principles

1. **Type-specific formatting**: Bug uses reproduction steps, Feature uses User Story, Task uses implementation steps
2. **Platform-native first**: Follow each platform's recommended formats and conventions
3. **Machine-parseable**: Frontmatter fields and description body are structurally separated
4. **Minimal required fields**: Core fields are required; extended fields are optional
