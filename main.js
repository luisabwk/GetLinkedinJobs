// main.js
import { Actor } from 'apify';
import { Router } from './routes.js';

await Actor.init();

const {
    searchTerm,
    location,
    li_at,
    maxJobs = 25,
    maxConcurrency = 5,
    timeout = 30000,
} = await Actor.getInput();

const crawler = await Actor.createPlaywrightCrawler({
    requestHandler: Router,
    maxConcurrency: 1, // Reduzido para evitar 429
    navigationTimeoutSecs: 60, // Aumentado para 60s
    maxRequestRetries: 5,
    requestHandlerTimeoutSecs: 180, // 3 min total
    browserPoolOptions: {
        useFingerprints: true, // Adiciona fingerprints
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
    requestHandlerTimeoutSecs: timeout / 1000,
});

await crawler.run([{
    url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`,
    userData: { maxJobs }
}]);

await Actor.exit();
