const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.static('public'));

let profileCache = null;
let lastFetched = 0;
const CACHE_DURATION = 3600000; // 1 hour

const fetchPage = (token, offset, limit) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.recurse.com',
      port: 443,
      path: `/api/v1/profiles?scope=current&limit=${limit}&offset=${offset}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Status: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
};

app.get('/api/directory', async (req, res) => {
  try {
    const now = Date.now();
    if (profileCache && (now - lastFetched < CACHE_DURATION)) {
      console.log('Serving directory from cache');
      return res.json(profileCache);
    }

    const token = fs.readFileSync('tok', 'utf8').trim();
    let allProfiles = [];
    let offset = 0;
    const limit = 50;
    let totalCount = Infinity;

    while (offset < totalCount) {
      console.log(`Fetching profiles starting at offset ${offset}...`);
      const data = await fetchPage(token, offset, limit);
      
      if (data.length === 0) break;

      // The RC API includes results_count in the profile objects
      if (totalCount === Infinity && data[0] && data[0].results_count !== undefined) {
        totalCount = data[0].results_count;
        console.log(`Total results to fetch: ${totalCount}`);
      }

      allProfiles = allProfiles.concat(data);
      offset += limit;

      // Safety break if we've reached the end or have no more data
      if (data.length < limit) break;
    }

    profileCache = allProfiles;
    lastFetched = now;
    res.json(allProfiles);
  } catch (error) {
    console.error('Error fetching directory:', error);
    res.status(500).json({ error: 'Failed to fetch directory' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
