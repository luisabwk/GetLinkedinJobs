// main.js
import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';
import router from './routes.js';
import randomUserAgent from 'random-useragent';

await Actor.init();

const input = await Actor.getInput();
console.log('Input received:', input);

const { searchTerm, location, jobUrl, proxyConfig, li_at } = input;

if (!li_at) {
    throw new Error('The LinkedIn session cookie "li_at" is required.');
}

const startUrls = jobUrl
    ? [{ url: jobUrl, label: 'jobDetail' }]
    : [{ url: `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`, label: 'jobListing' }];

const proxyConfiguration = await Actor.createProxyConfiguration({
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL'], // Use proxies residenciais para melhorar a taxa de sucesso
});

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu'],
        },
    },
    requestHandlerContext: input, // Propaga o input para os handlers
    preNavigationHooks: [async ({ page }) => {
        const userAgent = randomUserAgent.getRandom();
        await page.setUserAgent(userAgent);
    }],
});

await crawler.run(startUrls);

await Actor.exit();
