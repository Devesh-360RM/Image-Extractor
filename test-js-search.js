import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Find where "/app/store/api/v5/pub" or "ht" is referenced
    let idx = 0;
    while (true) {
      idx = code.indexOf('/app/store/api/v5/pub', idx);
      if (idx === -1) break;
      console.log('Found /app/store/api/v5/pub at index:', idx);
      console.log(code.slice(idx, idx + 400));
      idx += 1;
    }
  });
