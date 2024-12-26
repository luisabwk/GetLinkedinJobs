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

   await new Promise(r => setTimeout(r, 5000));

   try {
       const response = await page.goto(request.url, {
           waitUntil: 'domcontentloaded',
           timeout: 60000
       });

       if (response.status() === 429) {
           log.warning('Rate limit hit, waiting 30s...');
           await new Promise(r => setTimeout(r, 30000));
           throw new Error('Rate limited');
       }

       await page.waitForSelector('.jobs-search-results-list', {
           timeout: 30000 
       });

       const jobs = await page.evaluate(() => {
           const jobElements = Array.from(document.querySelectorAll('.job-card-container--clickable'));
           return jobElements.map(job => ({
               title: job.querySelector('.job-card-list__title--link')?.innerText.trim() || '',
               company: job.querySelector('.artdeco-entity-lockup__subtitle')?.innerText.trim() || '',
               location: job.querySelector('.job-card-container__metadata-wrapper')?.innerText.trim().replace(/\(.*?\)/, '').trim() || '',
               workType: job.querySelector('.job-card-container__metadata-wrapper')?.innerText.trim().match(/\(([^)]+)\)/)?.[1] || '',
               url: job.querySelector('a')?.href || ''
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

   try {
       const response = await page.goto(request.url, {
           waitUntil: 'domcontentloaded',
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

       const details = await page.evaluate(() => ({
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
