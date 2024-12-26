// routes.js
import { Dataset, createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
    log.info('Processing job listings page');
    const { maxJobs } = request.userData;
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
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
        if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    await new Promise(r => setTimeout(r, 2000));

    try {
        await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
        await new Promise(r => setTimeout(r, 1000));

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

        const dataset = await Dataset.open();
        const datasetSize = await dataset.getInfo().then(info => info?.itemCount || 0);

        if (datasetSize >= maxJobs) {
            return;
        }

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

        const nextPage = await page.$('button[aria-label="Next"]');
        if (nextPage) {
            const currentJobCount = await Dataset.getData().then(data => data?.items?.length || 0);
            if (currentJobCount < maxJobs) {
                const nextUrl = request.url.replace(/&start=\d+/, '') + `&start=${currentJobCount}`;
                await enqueueLinks({
                    urls: [nextUrl],
                    userData: request.userData
                });
            }
        }

    } catch (error) {
        log.error(`Failed to process listing: ${error.message}`);
        await new Promise(r => setTimeout(r, 10000));
        throw error;
    }
});

router.addHandler('DETAIL', async ({ request, page, log }) => {
    log.info(`Processing job details: ${request.url}`);
    
    await page.setCookie({
        name: 'li_at',
        value: request.userData.li_at,
        domain: '.linkedin.com',
        secure: true,
        httpOnly: true
    });

    try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(request.url, { waitUntil: 'networkidle2' });
        await page.waitForSelector('#job-details', { timeout: 30000 });
        
        const details = await page.evaluate(() => ({
            description: document.querySelector('#job-details')?.innerText.trim() || ''
        }));

        await Dataset.pushData({
            ...request.userData.jobData,
            ...details,
            scrapedAt: new Date().toISOString()
        });

        await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
        log.error(`Failed to process job detail: ${error.message}`);
        await new Promise(r => setTimeout(r, 10000));
        throw error;
    }
});
