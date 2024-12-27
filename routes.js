import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJobListings(page, url, maxJobs, li_at) {
    const browser = page.browser();
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
        if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    const results = [];
    let currentPage = 1;

    while (results.length < maxJobs) {
        const pageUrl = currentPage === 1 ? url : `${url}&start=${(currentPage - 1) * 25}`;
        console.log(`[INFO] Navigating to URL: ${pageUrl}`);

        try {
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log('[INFO] Page loaded successfully.');
        } catch (error) {
            console.error('[ERROR] Failed to load page:', error.message);
            break;
        }

        await sleep(3000);

        try {
            await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
            const jobs = await page.$$('.job-card-container--clickable');
            console.log(`[INFO] Found ${jobs.length} jobs`);

            for (const job of jobs) {
                if (results.length >= maxJobs) break;

                try {
                    await Promise.race([
                        job.click(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Click timeout')), 5000))
                    ]);
                    await sleep(2000);

                    const details = await extractJobDetails(page, browser);
                    results.push(details);

                    console.log('[INFO] Saving job data...');
                    await Actor.pushData(details);
                    console.log(`[INFO] Job processed: ${details.title}`);
                } catch (error) {
                    console.warn(`[WARN] Failed to process job: ${error.message}`);
                }
            }

            const nextButton = await page.$('button[aria-label="Next"]');
            const isDisabled = await page.evaluate(btn => btn?.disabled, nextButton);

            if (!nextButton || isDisabled) {
                console.log('[INFO] No more pages');
                break;
            }

            await nextButton.click();
            await sleep(2000);
        } catch (error) {
            console.warn(`[WARN] Error navigating to next page: ${error.message}`);
            break;
        }

        currentPage++;
    }

    return results;
}

async function extractJobDetails(page, browser) {
    console.log('[INFO] Extracting job details...');
    try {
        const details = await page.evaluate(() => {
            const title = document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() || '';
            const company = document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '';
            const locationData = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.innerText.trim() || '';
            const description = document.querySelector('#job-details')?.innerText.trim() || '';

            return {
                title,
                company,
                location: locationData.split(' ·')[0].trim() || '',
                description,
                applyUrl: null
            };
        });

        const applyButtonSelector = '.jobs-apply-button--top-card';
        const applyButton = await page.$(applyButtonSelector);

        if (applyButton) {
            const buttonText = await page.evaluate(button => button.textContent.trim(), applyButton);

            if (buttonText.includes('Candidatura simplificada')) {
                console.log('[INFO] Simplified application detected.');
                details.applyUrl = page.url();
            } else if (buttonText.includes('Candidatar-se')) {
                console.log('[INFO] Redirect application detected. Clicking apply button...');
                await applyButton.click();
                await sleep(3000);

                const newTabUrl = await page.evaluate(() => window.__NEW_TAB_URL__);
                details.applyUrl = newTabUrl || details.link;
            }
        } else {
            console.warn('[WARN] Apply button not found.');
            details.applyUrl = page.url();
        }

        return details;
    } catch (error) {
        console.error('[ERROR] Error extracting job details:', error.message);
        throw error;
    }
}
