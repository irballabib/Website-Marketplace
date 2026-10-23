module.exports = {
  singleQuote: true,
  trailingComma: 'es5',
  tabWidth: 2,
  semi: true,
  printWidth: 100,
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  plugins: ['prettier-plugin-packagejson'],
  overrides: [
    {
      files: ['*.md', '*.mdx'],
      options: {
        printWidth: 120,
      },
    },
  ],
};