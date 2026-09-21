import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Search for ".get(" pattern in the javascript code
    let idx = 0;
    const matches = [];
    while (true) {
      idx = code.indexOf('.get(', idx);
      if (idx === -1) break;
      const snippet = code.slice(Math.max(0, idx - 100), idx + 250);
      matches.push(snippet);
      idx += 5;
    }
    console.log('Total .get( matches found:', matches.length);
    // Filter matches that look like API calls or endpoints
    const apiGets = matches.filter(m => m.includes('/') || m.includes('api') || m.includes('url') || m.includes('ht') || m.includes('at'));
    console.log('API-like .get( matches:', apiGets.length);
    apiGets.slice(0, 30).forEach((m, i) => {
      console.log(`Match ${i}:`);
      console.log(m);
      console.log('--------------------------------------');
    });
  });
