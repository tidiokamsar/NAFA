/**
 * Conventional Commits, enforced by the `commit-msg` Husky hook.
 * Example: `feat(iam): add refresh token endpoint`
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'apps',
        'web',
        'mobile',
        'ai',
        'services',
        'iam',
        // Workspace packages — scope = package name (AGENTS.md §4).
        'shared',
        'platform',
        'security',
        'sdk',
        'foundation',
        'geography',
        'products',
        'trade',
        'actor',
        // Masters services; each distinct from the domain package it serves.
        // Every one of them warned on its own ticket's commits before being
        // listed here.
        'geography-service',
        'products-service',
        'trade-service',
        'actor-service',
        'packages',
        'database',
        'infra',
        'docker',
        'k8s',
        'helm',
        'ci',
        'docs',
        'tools',
        'deps',
        'repo',
      ],
    ],
  },
};
