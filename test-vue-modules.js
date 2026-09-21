import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/vue-modules.4a41b3ba298bf4563d97.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    const targets = ['/app/store/api/', 'FASTLY_URL_BASE', 'siteCatalogVersion', 'JsonRPC'];
    targets.forEach(t => {
      let idx = 0;
      while (true) {
        idx = code.indexOf(t, idx);
        if (idx === -1) break;
        console.log(`Matched target "${t}" in vue-modules at index:`, idx);
        console.log(code.slice(idx - 150, idx + 250));
        console.log('---------------------------');
        idx += t.length;
      }
    });
  });
