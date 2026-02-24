const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use('/scripts/ts-fsrs', express.static('node_modules/ts-fsrs/dist'));

let profileCache = null;
let lastFetched = 0;
const CACHE_DURATION = 3600000; // 1 hour
const CACHE_FILE = 'profiles_cache.json';

const fetchPage = (token, offset, limit) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.recurse.com',
      port: 443,
      path: `/api/v1/profiles?scope=current&limit=${limit}&offset=${offset}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
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

    // L1: In-memory cache
    if (profileCache && now - lastFetched < CACHE_DURATION) {
      console.log('Serving directory from L1 (memory) cache');
      return res.json(profileCache);
    }

    // L2: Disk cache
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      if (now - stats.mtimeMs < CACHE_DURATION) {
        console.log('Serving directory from L2 (disk) cache');
        const data = fs.readFileSync(CACHE_FILE, 'utf8');
        profileCache = JSON.parse(data);
        lastFetched = stats.mtimeMs;
        return res.json(profileCache);
      }
    }

    console.log('Cache expired or missing. Fetching from API...');
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

    // Save to L2 (disk) cache
    fs.writeFileSync(CACHE_FILE, JSON.stringify(allProfiles), 'utf8');

    res.json(allProfiles);
  } catch (error) {
    console.error('Error fetching directory:', error);
    res.status(500).json({ error: 'Failed to fetch directory' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
