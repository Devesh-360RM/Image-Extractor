import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Let's search for references to "/app/store/api/v5/pub" and print the next 2000 characters
    const idx = code.indexOf('/app/store/api/v5/pub');
    if (idx !== -1) {
      console.log('Context of API prefix:');
      console.log(code.slice(idx, idx + 2500));
    }
  });
