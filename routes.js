// routes.js
import { Dataset, createPuppeteerRouter } from 'crawlee';

const router = createPuppeteerRouter();

// Handler for scraping job listings
router.addHandler('jobListing', async ({ request, page, log, enqueueLinks }, input) => {
    log.info(`Scraping job listings: ${request.loadedUrl}`);

    const li_at = input.li_at;
    log.info(`Cookie li_at received: ${li_at ? 'YES' : 'NO'}`);

    if (!li_at) {
        throw new Error('Cookie "li_at" is missing from the input.');
    }

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
    const jobLinks = jobs.map(job => ({ url: job.link, label: 'jobDetail' }));
    await enqueueLinks({ requests: jobLinks });

    await new Promise((resolve) => setTimeout(resolve, 3000)); // 3-second delay
});

export default router;
