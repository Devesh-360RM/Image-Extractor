import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    let idx = 0;
    while (true) {
      idx = code.indexOf('PUBLISHED_CMS_API_PREFIX', idx);
      if (idx === -1) break;
      console.log('Found PUBLISHED_CMS_API_PREFIX at index:', idx);
      console.log(code.slice(idx - 150, idx + 250));
      console.log('---------------------------------');
      idx += 24;
    }
  });
