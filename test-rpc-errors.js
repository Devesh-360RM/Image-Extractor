const url = 'https://chikasboutique.square.site/ajax/api/JsonRPC/Commerce/?Commerce[Checkout::getSquareStoreConfig]';

async function run() {
  const payload = {
    id: 0,
    jsonrpc: "2.0",
    method: "Checkout::getSquareStoreConfig",
    params: []
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ data: payload })
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response body:', text);
  } catch (err) {
    console.log('Error:', err.message);
  }
}

run();
