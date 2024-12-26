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
   maxConcurrency: 1,
   maxRequestRetries: 3,
   maxRequestsPerCrawl: maxJobs * 2,
   requestHandlerTimeoutSecs: 180,
   navigationTimeoutSecs: 180,
   browserPoolOptions: {
       maxOpenPagesPerBrowser: 1,
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

// routes.js
import { Dataset, createPuppeteerRouter } from 'crawlee';

const router = createPuppeteerRouter();

router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
   log.info('Processing job listings page');

   await page.setBypassCSP(true);

   await page.setExtraHTTPHeaders({
       'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
       'Accept': '*/*',
       'Accept-Language': 'en-US,en;q=0.9',
       'Referer': 'https://www.linkedin.com/'
   });

   await page.setCookie({
       name: 'li_at',
       value: request.userData.li_at,
       domain: '.linkedin.com',
       secure: true,
       httpOnly: true
   });

   await page.setRequestInterception(true);
   page.on('request', (req) => {
       const resourceType = req.resourceType();
       if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font' || resourceType === 'stylesheet') {
           req.abort();
       } else {
           req.continue();
       }
   });

   await new Promise(r => setTimeout(r, 5000));

   try {
       const response = await page.goto(request.url, {
           waitUntil: "domcontentloaded",
           timeout: 120000
       });

       if (response.status() === 429) {
           log.warning('Rate limit hit, waiting 30s...');
           await new Promise(r => setTimeout(r, 30000));
           throw new Error('Rate limited');
       }

       await page.waitForSelector('.scaffold-layout__list', {
           timeout: 30000,
           visible: true
       });

       await new Promise(r => setTimeout(r, 2000));

       const jobs = await page.evaluate(() => {
           const jobElements = Array.from(document.querySelectorAll(".job-card-container--clickable"));
           return jobElements.map((job) => ({
               title: job.querySelector(".job-card-list__title--link")?.innerText.trim().replace(/\n/g, " ") || '',
               company: job.querySelector(".artdeco-entity-lockup__subtitle")?.innerText.trim() || '',
               location: job.querySelector(".job-card-container__metadata-wrapper")?.innerText.trim().replace(/\(.*?\)/, "").trim() || '',
               workType: job.querySelector(".job-card-container__metadata-wrapper")?.innerText.trim().match(/\(([^)]+)\)/)?.[1] || '',
               url: job.querySelector("a")?.href || ''
           })).filter(job => job.url);
       });

       log.info(`Found ${jobs.length} jobs`);

       const dataset = await Dataset.open();
       const datasetSize = await dataset.getInfo().then(info => info?.itemCount || 0);

       if (datasetSize >= request.userData.maxJobs) {
           log.info(`Reached max jobs limit (${request.userData.maxJobs})`);
           return;
       }

       for (const job of jobs) {
           await enqueueLinks({
               urls: [job.url],
               userData: { 
                   label: 'DETAIL',
                   jobData: job,
                   li_at: request.userData.li_at
               }
           });
       }

       await new Promise(r => setTimeout(r, 5000));

   } catch (error) {
       log.error(`Failed to process listing: ${error.message}`);
       throw error;
   }
});

router.addHandler('DETAIL', async ({ request, page, log }) => {
   log.info(`Processing job details: ${request.url}`);

   await page.setBypassCSP(true);

   await page.setExtraHTTPHeaders({
       'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
       'Accept': '*/*',
       'Accept-Language': 'en-US,en;q=0.9',
       'Referer': 'https://www.linkedin.com/'
   });
   
   await page.setCookie({
       name: 'li_at',
       value: request.userData.li_at,
       domain: '.linkedin.com',
       secure: true,
       httpOnly: true
   });

   await page.setRequestInterception(true);
   page.on('request', (req) => {
       const resourceType = req.resourceType();
       if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font' || resourceType === 'stylesheet') {
           req.abort();
       } else {
           req.continue();
       }
   });

   try {
       const response = await page.goto(request.url, {
           waitUntil: "domcontentloaded",
           timeout: 60000
       });

       if (response.status() === 429) {
           log.warning('Rate limit hit, waiting 30s...');
           await new Promise(r => setTimeout(r, 30000));
           throw new Error('Rate limited');
       }

       await page.waitForSelector('#job-details', {
           timeout: 60000,
           visible: true
       });

       const seeMoreButton = await page.$('.jobs-description__footer-button');
       if (seeMoreButton) {
           await seeMoreButton.click();
           await new Promise(r => setTimeout(r, 1000));
       }

       const details = await page.evaluate(() => ({
           title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() || '',
           company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
           location: document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.innerText.trim().split(' ·')[0].trim() || '',
           description: document.querySelector('#job-details')?.innerText.trim() || ''
       }));

       await Dataset.pushData({
           ...request.userData.jobData,
           ...details,
           scrapedAt: new Date().toISOString()
       });

       await new Promise(r => setTimeout(r, 5000));
   } catch (error) {
       log.error(`Failed to process job detail: ${error.message}`);
       throw error;
   }
});

export { router };
