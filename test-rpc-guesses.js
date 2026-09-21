const baseUrl = 'https://chikasboutique.square.site/ajax/api/JsonRPC/Commerce/?Commerce';

const methods = [
  { name: 'Checkout::getSquareStoreConfig', params: [] },
  { name: 'Catalog::get', params: [] },
  { name: 'Catalog::read', params: [] },
  { name: 'Catalog::getCategoryProducts', params: ["3AIV2XXPBK5V7SNYLHHJ6NGD"] },
  { name: 'Catalog::getCategoryProducts', params: [{ categoryId: "3AIV2XXPBK5V7SNYLHHJ6NGD" }] },
  { name: 'Catalog::getCategory', params: ["3AIV2XXPBK5V7SNYLHHJ6NGD"] },
  { name: 'Catalog::getProducts', params: ["3AIV2XXPBK5V7SNYLHHJ6NGD"] },
  { name: 'Catalog::getStoreCatalog', params: [] },
  { name: 'Catalog::getItems', params: [] },
  { name: 'Storefront::getCatalog', params: [] }
];

async function run() {
  for (const m of methods) {
    const url = `${baseUrl}[${m.name}]`;
    const payload = {
      id: 0,
      jsonrpc: "2.0",
      method: m.name,
      params: m.params
    };
    
    console.log(`Testing RPC Method: ${m.name} with params:`, JSON.stringify(m.params));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ data: payload })
      });
      console.log('  Status:', res.status);
      if (res.ok) {
        const text = await res.text();
        console.log('  Response preview:', text.slice(0, 300));
      }
    } catch (err) {
      console.log('  Error:', err.message);
    }
    console.log('-----------------------------------');
  }
}

run();
