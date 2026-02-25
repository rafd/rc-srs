import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

let cachedProfiles = null;
let cacheTime = 0;

const fetchProfiles = async (token, offset, limit) => {
  const response = await fetch(
    `https://www.recurse.com/api/v1/profiles?scope=current&limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Status: ${response.status}`);
  return response.json();
};

const fetchAllProfiles = async (token) => {
  let allProfiles = [];
  let offset = 0;
  const limit = 50;
  let totalCount = Infinity;

  while (offset < totalCount) {
    const data = await fetchProfiles(token, offset, limit);
    if (data.length === 0) break;

    if (totalCount === Infinity && data[0]?.results_count !== undefined) {
      totalCount = data[0].results_count;
    }

    allProfiles = allProfiles.concat(
      data.map(({ id, first_name, image_path, pronouns }) => ({ id, first_name, image_path, pronouns })),
    );
    offset += limit;

    if (data.length < limit) break;
  }

  return allProfiles;
};

const app = express();

app.use(express.static(join(__dirname, 'public')));

app.get('/api/directory', async (req, res) => {
  if (cachedProfiles && Date.now() - cacheTime < CACHE_DURATION_MS) {
    return res.json(cachedProfiles);
  }

  const token = process.env.RC_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'RC_TOKEN not configured' });
  }

  try {
    const profiles = await fetchAllProfiles(token);
    cachedProfiles = profiles;
    cacheTime = Date.now();
    res.setHeader('Cache-Control', `public, max-age=${6 * 60 * 60}`);
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
