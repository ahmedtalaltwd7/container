import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [{
		name: 'copy-service-worker',
		apply: 'build',
		generateBundle(_options, bundle) {
			const revision = createHash('sha256').update(Object.keys(bundle).sort().join('\n')).digest('hex').slice(0, 10);
			const serviceWorker = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
				.replace("'sijil-shell-build'", `'sijil-shell-${revision}'`);
			this.emitFile({
				type: 'asset',
				fileName: 'service-worker.js',
				source: serviceWorker
			});
			for (const icon of ['app-icon.svg', 'app-icon-192.png', 'app-icon-512.png']) {
				this.emitFile({
					type: 'asset',
					fileName: `icons/${icon}`,
					source: readFileSync(new URL(`./icons/${icon}`, import.meta.url))
				});
			}
		}
	}]
});
