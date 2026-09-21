import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    let idx = 0;
    while (true) {
      idx = code.indexOf('/ajax/api/JsonRPC/Commerce', idx);
      if (idx === -1) break;
      console.log('Found /ajax/api/JsonRPC/Commerce at index:', idx);
      console.log(code.slice(idx - 100, idx + 800));
      console.log('=================================');
      idx += 26;
    }
  });
