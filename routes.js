import { Dataset, createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
    log.info('Processing job listings page');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
    await page.setCookie({
        name: 'li_at', 
        value: request.userData.li_at,
        domain: '.linkedin.com'
    });

    try {
        await page.waitForSelector('.jobs-search-results-list', { timeout: 60000 });

        const jobs = await page.evaluate(() => {
            const jobElements = Array.from(document.querySelectorAll('.job-card-container--clickable'));
            return jobElements.map(job => ({
                vaga: job.querySelector('.job-card-list__title--link')?.innerText.trim().replace(/\n/g, ' ') || '',
                empresa: job.querySelector('.artdeco-entity-lockup__subtitle')?.innerText.trim() || '',
                local: job.querySelector('.job-card-container__metadata-wrapper')?.innerText.trim().replace(/\(.*?\)/, '').trim() || '',
                formato: job.querySelector('.job-card-container__metadata-wrapper')?.innerText.trim().match(/\(([^)]+)\)/)?.[1] || '',
                link: job.querySelector('a')?.href || ''
            }));
        });

        for (const job of jobs) {
            await enqueueLinks({
                urls: [job.link],
                userData: { 
                    label: 'DETAIL',
                    jobData: job
                }
            });
        }
    } catch (error) {
        log.error(`Failed to process listing: ${error.message}`);
        throw error;
    }
});

router.addHandler('DETAIL', async ({ request, page, log }) => {
    log.info('Processing job details');
    
    await page.waitForSelector('#job-details', { timeout: 30000 });
    
    try {
        const seeMoreButton = await page.$('.jobs-description__footer-button');
        if (seeMoreButton) await seeMoreButton.click();
    } catch (e) {
        log.debug('See more button not found');
    }

    const details = await page.evaluate(() => ({
        title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() || '',
        company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
        location: document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.innerText.trim().split(' ·')[0].trim() || '',
        description: document.querySelector('#job-details')?.innerText.trim() || ''
    }));

    await Dataset.pushData({
        ...request.userData.jobData,
        ...details
    });
});
