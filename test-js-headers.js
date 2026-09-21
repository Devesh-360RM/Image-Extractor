import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Search for headers like "X-" or "Client-"
    const regex = /"X-[a-zA-Z0-9\-]+"/g;
    const matches = code.match(regex) || [];
    console.log('Found "X-..." headers:');
    console.log([...new Set(matches)]);

    const regex2 = /'X-[a-zA-Z0-9\-]+'/g;
    const matches2 = code.match(regex2) || [];
    console.log('Found \'X-...\' headers:');
    console.log([...new Set(matches2)]);
  });
