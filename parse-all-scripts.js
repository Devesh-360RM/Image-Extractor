import fs from 'fs';

const content = fs.readFileSync('all-scripts.txt', 'utf-8');

// Find any block starting with window.__BOOTSTRAP_STATE__ or similar
const patterns = [
  'window.__BOOTSTRAP_STATE__',
  'window.Square',
  'Square'
];

patterns.forEach(p => {
  const idx = content.indexOf(p);
  if (idx !== -1) {
    console.log(`Found pattern "${p}" at index: ${idx}`);
    // Print around 600 characters
    console.log(content.slice(idx, idx + 600));
    console.log('=============================');
  }
});
