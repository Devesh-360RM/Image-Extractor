import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Search for occurrences of string concatenations with e-commerce paths
    const paths = ['/catalog', '/products', '/items', '/categories', '/search'];
    paths.forEach(p => {
      let idx = 0;
      while (true) {
        idx = code.indexOf(p, idx);
        if (idx === -1) break;
        // Print if it's enclosed in quotes or concatenated
        const snippet = code.slice(Math.max(0, idx - 80), idx + 100);
        if (snippet.includes('"') || snippet.includes("'") || snippet.includes('+') || snippet.includes('`')) {
          console.log(`Match for "${p}" at index:`, idx);
          console.log(snippet);
          console.log('---------------------------');
        }
        idx += p.length;
      }
    });
  });
