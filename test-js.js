const jsUrl = 'https://cdn3.editmysite.com/app/website/js/site.18ecfa588b99504e336b.js';

fetch(jsUrl)
  .then(res => res.text())
  .then(code => {
    console.log('Downloaded site JS. Length:', code.length);
    
    // Search for URL patterns
    const regex = /\/s\/api\/v\d\/[a-zA-Z0-9_\-\/]+/g;
    const matches = code.match(regex) || [];
    console.log('Matched /s/api/ patterns:', [...new Set(matches)]);
    
    const otherApis = code.match(/\/api\/v\d\/[a-zA-Z0-9_\-\/]+/g) || [];
    console.log('Matched /api/ patterns:', [...new Set(otherApis)]);

    // Check for "search" or "catalog" or "items" or "category"
    const keywordMatches = [];
    const keywords = ['/api/', 'endpoint', '/store/', 'search', '/s/api/'];
    
    // Find lines containing "api"
    const lines = code.split('\n');
    console.log('Total lines in JS:', lines.length);
    
    // Search for fetch or axios or ajax endpoints inside code
    const patterns = [
      /url\s*:\s*["'][^"']+api[^"']+["']/gi,
      /fetch\s*\(\s*["'][^"']+["']/gi,
      /get\s*\(\s*["'][^"']+api[^"']+["']/gi,
      /["']\/[a-zA-Z0-9_\-\/]*api\/[a-zA-Z0-9_\-\/]*["']/gi
    ];
    
    patterns.forEach((pat, index) => {
      const ms = code.match(pat) || [];
      console.log(`Pattern ${index} matched ${ms.length} times. Samples:`, [...new Set(ms)].slice(0, 10));
    });
  });
