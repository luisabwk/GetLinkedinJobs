// main.js
import { Actor } from 'apify';
import { PlaywrightCrawler } from '@crawlee/playwright';
import { Router } from './routes.js';

await Actor.init();

const {
    searchTerm,
    location,
    li_at,
    maxJobs = 25,
    maxConcurrency = 1,
    timeout = 60000,
} = await Actor.getInput();

const crawler = new PlaywrightCrawler({
    requestHandler: Router,
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    maxRequestRetries: 5,
    requestHandlerTimeoutSecs: 180,
    browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
            screen: { width: 1920, height: 1080 }
        }
    },
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
