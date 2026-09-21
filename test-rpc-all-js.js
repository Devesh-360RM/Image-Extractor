import fs from 'fs';

const urls = [
  'https://cdn3.editmysite.com/app/checkout/assets/checkout/system.c3b89b0b94f4ef0671b1.js',
  'https://cdn3.editmysite.com/app/checkout/assets/checkout/imports.en.f27d48a8ad137523.js',
  'https://cdn3.editmysite.com/app/website/js/runtime.1340c47d252b4ed870f2.js',
  'https://cdn3.editmysite.com/app/website/js/vue-modules.4a41b3ba298bf4563d97.js',
  'https://cdn3.editmysite.com/app/website/js/languages/en.a36e54112b91737f1a30.js',
  'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js'
];

async function scan() {
  for (const url of urls) {
    console.log('Scanning JS URL:', url);
    try {
      const res = await fetch(url);
      const code = await res.text();
      const regex = /[a-zA-Z0-9_]+::[a-zA-Z0-9_]+/g;
      const matches = code.match(regex) || [];
      console.log('  Unique matches found:', [...new Set(matches)].length);
      console.log('  Sample matches:', [...new Set(matches)].slice(0, 15));
    } catch (err) {
      console.log('  Error:', err.message);
    }
  }
}

scan();
