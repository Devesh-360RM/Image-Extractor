import fs from 'fs';

const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    // Look for occurrences of "ht + " or "ht+" or "`" or other joining techniques
    const targets = ['ht+', 'ht +', 'ht[', 'ht.', 'url:ht', 'url: ht'];
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
