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
        console.log(`[INFO] Processing page ${currentPage}`);

        try {
            console.log(`[INFO] Navigating to URL: ${pageUrl}`);
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log('[INFO] Page loaded successfully.');
        } catch (error) {
            console.error('[ERROR] Failed to load page:', error.message);
            break; // Interromper se a navegação falhar
        }

        await sleep(3000);

        await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
        const jobs = await page.$$('.job-card-container--clickable');
        console.log(`[INFO] Found ${jobs.length} jobs`);

        for (const job of jobs) {
            if (results.length >= maxJobs) break;

            try {
                console.log('[INFO] Clicking on job...');
                await Promise.race([
                    job.click(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Click timeout')), 5000))
                ]);
                await sleep(2000);
            } catch (error) {
                console.warn(`[WARN] Failed to click on job: ${error.message}`);
                continue;
            }

            try {
                const details = await extractJobDetails(page, browser);
                results.push(details);
                console.log('[INFO] Saving job data...');
                await Actor.pushData(details);
                console.log('[INFO] Job data saved.');
                console.log(`[INFO] Processed job: ${details.title}`);
            } catch (error) {
                console.error('[ERROR] Failed to process job:', error.message);
            }
        }

        const nextButton = await page.$('button[aria-label="Next"]');
        const isDisabled = await page.evaluate(btn => btn?.disabled, nextButton);

        if (!nextButton || isDisabled) {
            console.log('[INFO] No more pages');
            break;
        }

        try {
            console.log('[INFO] Navigating to next page...');
            await nextButton.click();
            await sleep(2000);
        } catch (error) {
            console.warn('[WARN] Failed to navigate to next page:', error.message);
            break;
        }

        currentPage++;
    }

    return results;
}

async function extractJobDetails(page, browser) {
    console.log('[INFO] Extracting job details...');
    const details = await page.evaluate(() => {
        const locationEl = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container');
        let location = '';
        let format = '';

        if (locationEl) {
            const fullText = locationEl.innerText.split('·')[0].trim();
            const formatMatch = fullText.match(/\(([^)]+)\)/);
            if (formatMatch) {
                format = formatMatch[1].trim();
                location = fullText.replace(/\(([^)]+)\)/, '').trim();
            } else {
                location = fullText;
            }
        }

        const link = window.location.href;
        const viewUrl = `https://www.linkedin.com/jobs/view/${link.match(/view\/(\d+)/)?.[1] || ''}`;

        return {
            title: document.querySelector('h1')?.innerText.trim() || '',
            company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
            link: viewUrl,
            location,
            format,
            description: document.querySelector('#job-details')?.innerText.trim() || ''
        };
    });

    try {
        const applyButton = await page.$('.jobs-apply-button--top-card');
        if (applyButton) {
            const buttonText = await page.evaluate(btn => btn.textContent.trim(), applyButton);

            if (buttonText.includes('Candidatura simplificada')) {
                details.applyUrl = details.link;
            } else if (buttonText.includes('Candidatar-se')) {
                await applyButton.click();
                await sleep(2000);

                const newPagePromise = new Promise(resolve =>
                    browser.once('targetcreated', async target => {
                        const newPage = await target.page();
                        if (newPage) resolve(newPage);
                    })
                );

                const newPage = await newPagePromise;

                if (newPage) {
                    details.applyUrl = await newPage.url();
                    await newPage.close();
                } else {
                    console.warn('[WARN] New tab did not open. Using fallback URL.');
                    details.applyUrl = details.link;
                }
            }
        } else {
            details.applyUrl = details.link;
        }
    } catch (e) {
        console.error('[ERROR] Error getting apply URL:', e.message);
        details.applyUrl = details.link;
    }

    console.log('[INFO] Job details extracted:', details);
    return details;
}
