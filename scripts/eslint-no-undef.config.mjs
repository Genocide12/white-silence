// ESLint-конфиг для статического поиска неописанных переменных (no-undef)
// в ES5-коде игры «Белое Безмолвие». Запуск:
//   node_modules/.bin/eslint -c scripts/eslint-no-undef.config.mjs 'js/**/*.js' js/main.js
import globals from 'globals';

export default [
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: { ...globals.browser, WS: 'writable', Float32Array: 'readonly', Uint8Array: 'readonly', Uint16Array: 'readonly', Uint32Array: 'readonly', Int8Array: 'readonly', Int16Array: 'readonly', Int32Array: 'readonly', ArrayBuffer: 'readonly', DataView: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
