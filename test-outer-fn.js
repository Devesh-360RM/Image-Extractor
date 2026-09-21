import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    const target = 'const Bt=`${a.f0}${tt}/users/${y}/sites/${S}`';
    const idx = code.indexOf(target);
    if (idx !== -1) {
      console.log('Found target at index:', idx);
      // Let's print 4000 characters before the target to see the function signature and variables definitions!
      console.log(code.slice(idx - 3500, idx + 100));
    }
  });
