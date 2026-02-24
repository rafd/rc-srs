const express = require('express');
const path = require('path');
const https = require('https');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.static('public'));

app.get('/api/directory', (req, res) => {
  const token = fs.readFileSync('tok', 'utf8').trim();
  const options = {
    hostname: 'www.recurse.com',
    port: 443,
    path: '/api/v1/profiles?scope=current',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    res.status(500).send('Internal Server Error');
  });

  proxyReq.end();
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
