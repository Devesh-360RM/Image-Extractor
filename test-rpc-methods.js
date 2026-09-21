import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Search for patterns containing "::"
    const regex = /[a-zA-Z0-9]+::[a-zA-Z0-9]+/g;
    const matches = code.match(regex) || [];
    console.log('Found double-colon methods in JS code:');
    console.log([...new Set(matches)]);
  });
