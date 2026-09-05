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
        // First Masters service; distinct from the geography domain package.
        'geography-service',
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
