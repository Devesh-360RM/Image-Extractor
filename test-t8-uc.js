import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Look for occurrences of ".T8" or ".Uc" or similar (or imported destructured names)
    // The keys exported are: T8, Uc
    const targets = ['.T8', '.Uc', 'T8(', 'Uc('];
    targets.forEach(t => {
      let idx = 0;
      while (true) {
        idx = code.indexOf(t, idx);
        if (idx === -1) break;
        console.log(`Matched target "${t}" at index:`, idx);
        console.log(code.slice(idx - 150, idx + 250));
        console.log('---------------------------');
        idx += t.length;
      }
    });
  });
