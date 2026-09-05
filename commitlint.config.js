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
        'foundation',
        'geography',
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
