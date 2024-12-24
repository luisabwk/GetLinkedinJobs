// routes.js
import { Dataset, createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

// Handler for scraping job listings
router.addHandler('jobListing', async ({ request, page, log, enqueueLinks, crawlerInput }) => {
    log.info(`Scraping job listings: ${request.loadedUrl}`);

    const li_at = process.env.li_at || crawlerInput?.li_at;
    log.info(`Cookie li_at received: ${li_at ? 'YES' : 'NO'}`);

    if (!li_at) {
        throw new Error('Cookie "li_at" is missing from the input.');
    }

    // Set the LinkedIn session cookie
    await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com',
    });

    await page.goto(request.loadedUrl, { waitUntil: 'domcontentloaded' });

    const jobs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.job-card-container--clickable')).map(job => ({
            title: job.querySelector('.job-card-list__title')?.innerText.trim() || '',
            company: job.querySelector('.job-card-container__company-name')?.innerText.trim() || '',
            location: job.querySelector('.job-card-container__metadata-item')?.innerText.trim() || '',
            link: job.querySelector('a')?.href || '',
        }));
    });

    await Dataset.pushData(jobs);
    log.info(`Scraped ${jobs.length} jobs.`);

    // Enqueue links to job details if available
    const jobLinks = jobs.map(job => ({ url: job.link, label: 'jobDetail' }));
    await enqueueLinks({ requests: jobLinks });

    // Add delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 3000)); // 3-second delay
});

// Handler for scraping job details
router.addHandler('jobDetail', async ({ request, page, log, crawlerInput }) => {
    log.info(`Scraping job details: ${request.loadedUrl}`);

    const li_at = process.env.li_at || crawlerInput?.li_at;
    log.info(`Cookie li_at received: ${li_at ? 'YES' : 'NO'}`);

    if (!li_at) {
        throw new Error('Cookie "li_at" is missing from the input.');
    }

    // Set the LinkedIn session cookie
    await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com',
    });

    await page.goto(request.loadedUrl, { waitUntil: 'domcontentloaded' });

    const jobDetails = await page.evaluate(() => {
        return {
            title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() || '',
            company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
            location: document.querySelector('.job-details-jobs-unified-top-card__bullet')?.innerText.trim() || '',
            description: document.querySelector('#job-details')?.innerText.trim() || '',
        };
    });

    await Dataset.pushData({ ...jobDetails, url: request.loadedUrl });
    log.info(`Job details saved.`);

    // Add delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 3000)); // 3-second delay
});
