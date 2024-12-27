// main.js
import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

await Actor.init();

const {
    searchTerm,
    location,
    li_at,
    maxJobs = 25,
    timeout = 60000,
} = await Actor.getInput();

const crawler = new PuppeteerCrawler({
    requestHandler: Router,
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    maxRequestRetries: 5,
    requestHandlerTimeoutSecs: 180,
    preNavigationHooks: [
        async ({ page }) => {
            await page.setExtraHTTPHeaders({
                'Cookie': `li_at=${li_at}`
            });
        }
    ],
});

await crawler.run([{
    url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`,
    userData: { maxJobs }
}]);

await Actor.exit();
