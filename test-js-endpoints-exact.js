import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    const regex = /"\/app\/store\/api\/[^"]+"/g;
    const matches = code.match(regex) || [];
    console.log('Found /app/store/api/ patterns in double quotes:');
    console.log([...new Set(matches)]);

    const singleQuoteRegex = /'\/app\/store\/api\/[^']+'/g;
    const singleMatches = code.match(singleQuoteRegex) || [];
    console.log('Found /app/store/api/ patterns in single quotes:');
    console.log([...new Set(singleMatches)]);
    
    // Check how requests are made to catalog
    // Search for "catalog" in the file near ht or at
    let idx = 0;
    while (true) {
      idx = code.indexOf('/catalog', idx);
      if (idx === -1) break;
      console.log('Found /catalog at index:', idx);
      console.log(code.slice(idx - 100, idx + 100));
      idx += 1;
    }
  });
