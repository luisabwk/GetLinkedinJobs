import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

const input = await Actor.getInput();
const { searchTerm, location, li_at, maxJobs = 50 } = input;

if (!searchTerm || !location || !li_at) {
    throw new Error('searchTerm, location and li_at are required');
}

const startUrls = [{
    url: `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`,
    userData: { label: 'LIST' }
}];

const proxyConfiguration = await Actor.createProxyConfiguration();

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu']
        }
    }
});

await crawler.run(startUrls);
await Actor.exit();
