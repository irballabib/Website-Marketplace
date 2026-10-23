import type { Config } from 'tailwindcss';
import preset from '@cutbray/config/tailwind/preset';

const config: Config = {
  ...preset,
  content: [
    ...preset.content,
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
};

export default config;