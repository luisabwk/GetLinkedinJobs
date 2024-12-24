// main.js
import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';
import { router } from './routes.js';

await Actor.init();

const input = await Actor.getInput();
const { searchTerm, location, jobUrl, proxyConfig, li_at } = input;

if (!li_at) {
    throw new Error('The LinkedIn session cookie "li_at" is required.');
}

const startUrls = jobUrl
    ? [{ url: jobUrl, label: 'jobDetail' }]
    : [{ url: `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`, label: 'jobListing' }];

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu'],
        },
    },
});

await crawler.run(startUrls);

await Actor.exit();
