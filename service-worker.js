const CACHE_NAME = 'sijil-shell-build';

async function cacheableResponse(response) {
	const body = await response.arrayBuffer();
	const headers = new Headers(response.headers);
	for (const header of ['vary', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive']) {
		headers.delete(header);
	}
	return {
		response: new Response(body, { status: response.status, statusText: response.statusText, headers }),
		body
	};
}

async function cacheAssetAndImports(cache, assetUrl, visited) {
	if (visited.has(assetUrl.href)) return;
	visited.add(assetUrl.href);
	const response = await fetch(assetUrl.href, { cache: 'reload' });
	if (!response.ok) throw new Error(`Failed to cache app asset: ${assetUrl.pathname}`);
	const { response: copy, body } = await cacheableResponse(response);
	await cache.put(assetUrl.href, copy);
	const contentType = response.headers.get('content-type') || '';
	if (contentType.includes('javascript')) {
		const source = new TextDecoder().decode(body); 
		const imports = [...source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)];
		for (const match of imports) {
			const importedUrl = new URL(match[1], assetUrl);
			if (importedUrl.origin === self.location.origin) await cacheAssetAndImports(cache, importedUrl, visited);
		}
	} else if (contentType.includes('json')) {
		const manifest = JSON.parse(new TextDecoder().decode(body));
		for (const icon of manifest.icons || []) {
			const iconUrl = new URL(icon.src, assetUrl);
			if (iconUrl.origin === self.location.origin) await cacheAssetAndImports(cache, iconUrl, visited);
		}
	}
}

self.addEventListener('install', (event) => {
	event.waitUntil((async () => {
		const cache = await caches.open(CACHE_NAME);
		const response = await fetch('/', { cache: 'reload' });
		if (!response.ok) throw new Error('Failed to cache the application page.');
		const html = await response.clone().text();
		await cache.put('/', response.clone());
		await cache.put('/index.html', new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
		const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
		const visited = new Set();
		for (const assetPath of assetPaths) {
			const assetUrl = new URL(assetPath, self.location.origin);
			if (assetUrl.origin === self.location.origin) await cacheAssetAndImports(cache, assetUrl, visited);
		}
		await self.skipWaiting();
	})());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('sijil-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).then((response) => {
			if (response.ok) {
				const copy = response.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
			}
			return response;
		}).catch(() => caches.match('/index.html')));
		return;
	}

	event.respondWith(caches.match(request, { ignoreVary: true }).then((cached) => {
		if (cached) return cached;
		return fetch(request).then((response) => {
			if (response.ok) {
				const copy = response.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
			}
			return response;
		});
	}));
});
