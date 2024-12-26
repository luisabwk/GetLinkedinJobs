// main.js
import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee'; 
import { router } from './routes.js';

await Actor.init();

const input = await Actor.getInput();
const { searchTerm, location, li_at, maxJobs = 25 } = input;

if (!searchTerm || !location || !li_at) {
   throw new Error('searchTerm, location and li_at are required');
}

const proxyConfiguration = await Actor.createProxyConfiguration({
   groups: ['RESIDENTIAL'] 
});

const crawler = new PuppeteerCrawler({
   proxyConfiguration,
   requestHandler: router,
   maxConcurrency: 2,
   maxRequestRetries: 2,
   maxRequestsPerCrawl: maxJobs * 2,
   requestHandlerTimeoutSecs: 30,
   navigationTimeoutSecs: 30,
   browserPoolOptions: {
       maxOpenPagesPerBrowser: 2,
       useFingerprints: true
   }
});

await crawler.run([{ 
   url: `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400&start=0&position=1`,
   userData: { 
       label: 'LIST',
       li_at,
       maxJobs,
       retryCount: 0
   }
}]);

await Actor.exit();
