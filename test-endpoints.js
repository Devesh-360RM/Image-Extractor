const testEndpoints = [
  'https://chikasboutique.square.site/app/store/api/v5/pub/products',
  'https://chikasboutique.square.site/app/store/api/v5/pub/products?limit=100',
  'https://chikasboutique.square.site/app/store/api/v5/pub/products?category=3AIV2XXPBK5V7SNYLHHJ6NGD',
  'https://chikasboutique.square.site/app/store/api/v5/pub/products?category_id=3AIV2XXPBK5V7SNYLHHJ6NGD',
  'https://chikasboutique.square.site/app/store/api/v5/pub/catalog'
];

async function run() {
  for (const url of testEndpoints) {
    console.log('Testing endpoint:', url);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json'
        }
      });
      console.log('  Response status:', res.status);
      if (res.ok) {
        const text = await res.text();
        console.log('  Length:', text.length);
        if (text.startsWith('{') || text.startsWith('[')) {
          const data = JSON.parse(text);
          console.log('  Keys:', Object.keys(data));
          if (Array.isArray(data.items)) {
            console.log('  Found items array! Count:', data.items.length);
            if (data.items.length > 0) {
              console.log('  First item:', JSON.stringify(data.items[0]).slice(0, 300));
            }
          }
          if (Array.isArray(data.products)) {
            console.log('  Found products array! Count:', data.products.length);
            if (data.products.length > 0) {
              console.log('  First product:', JSON.stringify(data.products[0]).slice(0, 300));
            }
          }
          if (Array.isArray(data.data)) {
            console.log('  Found data array! Count:', data.data.length);
            if (data.data.length > 0) {
              console.log('  First data:', JSON.stringify(data.data[0]).slice(0, 300));
            }
          }
        } else {
          console.log('  Response is not JSON:', text.slice(0, 150));
        }
      }
    } catch (err) {
      console.log('  Error:', err.message);
    }
  }
}

run();
