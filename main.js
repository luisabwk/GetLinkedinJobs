import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

const input = await Actor.getInput();
const { searchTerm, location, li_at, maxJobs = 50 } = input;

if (!searchTerm || !location || !li_at) {
    throw new Error('searchTerm, location and li_at are required');
}

const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`;

const proxyConfiguration = await Actor.createProxyConfiguration();

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-sandbox'
            ]
        }
    }
});

await crawler.run([{ url: baseUrl, userData: { label: 'LIST', li_at } }]);
await Actor.exit();
