const baseConfig = require('./base.js');

module.exports = [
  ...baseConfig,
  {
    plugins: ['@nestjs'],
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
    },
  },
];