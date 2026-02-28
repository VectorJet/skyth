import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		alias: {
			'@': '../../skyth',
			'@shared': '../shared'
		}
	}
};

export default config;
