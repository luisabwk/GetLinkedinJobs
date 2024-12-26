import { Dataset, createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

const RATE_LIMIT_DELAY = 10000;

router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
   log.info('Processing job listings page');
   
   await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
   
   await page.setCookie({
       name: 'li_at', 
       value: request.userData.li_at,
       domain: '.linkedin.com',
       httpOnly: true,
       secure: true
   });

   await page.setRequestInterception(true);
   page.on('request', (req) => {
       const resourceType = req.resourceType();
       if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
           req.abort();
       } else {
           req.continue();
       }
   });

   const response = await page.goto(request.url, {
       waitUntil: 'networkidle2',
       timeout: 90000
   });

   if (response.status() === 429) {
       log.warning('Rate limit detected, waiting before retry');
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

       log.info(`Found ${jobs.length} jobs`);

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

       const nextButton = await page.$('button[aria-label="Próxima"]');
       if (nextButton) {
           const nextUrl = await page.evaluate(() => {
               const currentPage = parseInt(document.querySelector('.artdeco-pagination__indicator--current')?.innerText || '1');
               const baseUrl = window.location.href.split('&start=')[0];
               return `${baseUrl}&start=${currentPage * 25}`;
           });

           if (nextUrl) {
               await enqueueLinks({
                   urls: [nextUrl],
                   userData: {
                       label: 'LIST',
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
   log.info(`Processing job details: ${request.url}`);
   
   try {
       await page.setCookie({
           name: 'li_at', 
           value: request.userData.li_at,
           domain: '.linkedin.com',
           httpOnly: true,
           secure: true
       });

       const response = await page.goto(request.url, {
           waitUntil: 'networkidle2',
           timeout: 60000
       });

       if (response.status() === 429) {
           log.warning('Rate limit detected, waiting before retry');
           await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
           throw new Error('Rate limited - retrying after delay');
       }
       
       await page.waitForSelector('#job-details', { 
           timeout: 60000,
           visible: true 
       });

       const seeMoreButton = await page.$('.jobs-description__footer-button');
       if (seeMoreButton) {
           await seeMoreButton.click();
           await page.waitForTimeout(1000);
       }

       const details = await page.evaluate(() => ({
           description: document.querySelector('#job-details')?.innerText.trim() || ''
       }));

       await Dataset.pushData({
           ...request.userData.jobData,
           ...details,
           scrapedAt: new Date().toISOString()
       });
   } catch (e) {
       log.error(`Failed to process job detail: ${e.message}`);
       throw e;
   }
});
