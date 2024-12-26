// main.js
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
    maxRequestRetries: 3,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 180,
    navigationTimeoutSecs: 180,
    maxRequestsPerCrawl: maxJobs * 2,
    browserPoolOptions: {
        maxOpenPagesPerBrowser: 1
    }
});

await crawler.run([{ url: baseUrl, userData: { label: 'LIST', li_at } }]);
await Actor.exit();
