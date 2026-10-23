const baseConfig = require('./base.js');

module.exports = [
  ...baseConfig,
  {
    extends: [
      'plugin:@next/next/recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'plugin:jsx-a11y/recommended',
    ],
    plugins: ['react', 'react-hooks', 'jsx-a11y'],
    settings: {
      react: { version: '19' },
      next: { rootDir: __dirname },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'jsx-a11y/anchor-is-valid': 'off',
    },
  },
];