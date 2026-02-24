const CACHE_DURATION = 6 * 60 * 60; // 6 hours in seconds

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

export async function onRequestGet({ env }) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/api/directory');

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const token = env.RC_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'RC_TOKEN not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allProfiles = await fetchAllProfiles(token);

  const response = new Response(JSON.stringify(allProfiles), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_DURATION}`,
    },
  });

  await cache.put(cacheKey, response.clone());
  return response;
}
