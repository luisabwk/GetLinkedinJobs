import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJobListings(page, url, maxJobs, li_at) {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );

    await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com',
        path: '/'
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

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            console.log(`[INFO] Navigation attempt ${attempt + 1}/3`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
            await sleep(3000);
            
            console.log('[INFO] Waiting for job list...');
            await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
            const jobsFound = await page.$$('.job-card-container--clickable');
            
            if (jobsFound.length > 0) {
                console.log(`[INFO] Found ${jobsFound.length} jobs`);
                break;
            }
            throw new Error('No jobs found');
        } catch (error) {
            console.warn(`[WARN] Attempt ${attempt + 1} failed:`, error.message);
            if (attempt === 2) throw error;
            await sleep(5000);
            await page.reload({ waitUntil: 'domcontentloaded' });
        }
    }

    const results = [];

    try {
        while (results.length < maxJobs) {
            const jobs = await page.$$('.job-card-container--clickable');
            console.log(`[INFO] Processing ${jobs.length} jobs on current page`);
            
            for (const job of jobs) {
                if (results.length >= maxJobs) break;

                await job.click();
                await sleep(2000);

                const jobDetails = await extractJobDetails(page);
                if (jobDetails.title) {
                    results.push(jobDetails);
                    await Actor.pushData(jobDetails);
                    console.log(`[INFO] Processed: ${jobDetails.title} at ${jobDetails.company}`);
                }
            }

            const nextButton = await page.$('button[aria-label="Next"]');
            if (!nextButton) {
                console.log('[INFO] No more pages');
                break;
            }

            await nextButton.click();
            await sleep(2000);
            await page.waitForSelector('.job-card-container--clickable', { timeout: 10000 });
        }

        return results;
    } catch (error) {
        console.error('[ERROR] Failed to scrape jobs:', error);
        throw error;
    }
}

async function extractJobDetails(page) {
    try {
        const seeMoreButton = await page.$('.jobs-description__footer-button');
        if (seeMoreButton) {
            await seeMoreButton.click();
            await sleep(1000);
        }
    } catch (e) {}

    const details = await page.evaluate(() => {
        const locationData = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.innerText.trim() || '';
        const formatMatch = locationData.match(/\(([^)]+)\)/);
        const format = formatMatch ? formatMatch[1].trim() : '';
        const location = locationData.replace(/\([^)]+\)/, '').trim();

        return {
            title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() || '',
            company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
            location,
            format,
            description: document.querySelector('#job-details')?.innerText.trim() || ''
        };
    });

    try {
        const applyButton = await page.$('.jobs-apply-button--top-card');
        if (applyButton) {
            const buttonText = await page.evaluate(button => button.textContent.trim(), applyButton);

            if (buttonText.includes('Candidatura simplificada')) {
                details.applyUrl = page.url();
            } else if (buttonText.includes('Candidatar-se')) {
                await applyButton.click();
                await sleep(2000);

                const newPagePromise = new Promise(resolve => 
                    browser.once('targetcreated', target => resolve(target.page()))
                );
                const newPage = await newPagePromise;
                
                if (newPage) {
                    details.applyUrl = await newPage.url();
                    await newPage.close();
                }
            }
        } else {
            details.applyUrl = page.url();
        }
    } catch (e) {
        console.error('[ERROR] Error getting apply URL:', e);
        details.applyUrl = page.url();
    }

    return details;
}
