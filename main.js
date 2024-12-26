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
   maxRequestRetries: 5,
   requestHandlerTimeoutSecs: 120,
   navigationTimeoutSecs: 120,
   maxRequestsPerCrawl: maxJobs * 2,
   preNavigationHooks: [
       async ({ page, request }) => {
           await page.setExtraHTTPHeaders({
               'Accept-Language': 'en-US,en;q=0.9',
               'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
           });
       }
   ]
});

await crawler.run([{ url: baseUrl, userData: { label: 'LIST', li_at } }]);
await Actor.exit();

// routes.js
import { Dataset, createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

const RATE_LIMIT_DELAY = 10000;

router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
   log.info('Processing job listings page');
   
   await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
   
   await page.setCookie({
       name: 'li_at', 
       value: request.userData.li_at,
       domain: '.linkedin.com'
   });

   const response = await page.goto(request.url, {
       waitUntil: 'networkidle2',
       timeout: 90000
   });

   if (response.status() === 429) {
       await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
       throw new Error('Rate limited - retrying after delay');
   }

   try {
       await page.waitForSelector('.scaffold-layout__list', { 
           timeout: 90000,
           visible: true 
       });

       const jobs = await page.evaluate(() => {
           const jobElements = Array.from(document.querySelectorAll('.job-card-container--clickable'));
           return jobElements.map(job => ({
               title: job.querySelector('.job-card-list__title--link')?.innerText.trim().replace(/\n/g, ' ') || '',
               company: job.querySelector('.artdeco-entity-lockup__subtitle')?.innerText.trim() || '',
               location: job.querySelector('.job-card-container__metadata-wrapper')?.innerText.trim().replace(/\(.*?\)/, '').trim() || '',
               workType: job.querySelector('.job-card-container__metadata-wrapper')?.innerText.trim().match(/\(([^)]+)\)/)?.[1] || '',
               url: job.querySelector('a')?.href || ''
           }));
       });

       for (const job of jobs) {
           if (job.url) {
               await enqueueLinks({
                   urls: [job.url],
                   userData: { 
                       label: 'DETAIL',
                       jobData: job,
                       li_at: request.userData.li_at
                   }
               });
           }
       }
   } catch (error) {
       log.error(`Failed to process listing: ${error.message}`);
       throw error;
   }
});

router.addHandler('DETAIL', async ({ request, page, log }) => {
   log.info('Processing job details');
   
   try {
       await page.setCookie({
           name: 'li_at', 
           value: request.userData.li_at,
           domain: '.linkedin.com'
       });

       const response = await page.goto(request.url, {
           waitUntil: 'networkidle2',
           timeout: 60000
       });

       if (response.status() === 429) {
           await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
           throw new Error('Rate limited - retrying after delay');
       }
       
       await page.waitForSelector('#job-details', { 
           timeout: 60000,
           visible: true 
       });

       const seeMoreButton = await page.$('.jobs-description__footer-button');
       if (seeMoreButton) await seeMoreButton.click();

       await page.waitForTimeout(1000);

       const details = await page.evaluate(() => ({
           description: document.querySelector('#job-details')?.innerText.trim() || ''
       }));

       await Dataset.pushData({
           ...request.userData.jobData,
           ...details
       });
   } catch (e) {
       log.error(`Failed to process job detail: ${e.message}`);
       throw e;
   }
});
