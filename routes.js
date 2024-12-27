import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJobListings(page, url, maxJobs, li_at) {
    // Page setup
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com',
        path: '/'
    });

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'image' || resourceType === 'media' || 
            resourceType === 'font' || resourceType === 'stylesheet') {
            req.abort();
        } else {
            req.continue();
        }
    });

    const results = [];
    let currentPage = 0;

    try {
        while (results.length < maxJobs) {
            const pageUrl = currentPage === 0 ? url : `${url}&start=${currentPage * 25}`;
            console.log(`[INFO] Loading page ${currentPage + 1}`);

            // Navigate to page
            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(3000);

            // Wait for job list
            const jobList = await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
            const jobs = await page.$$('.job-card-container--clickable');
            console.log(`[INFO] Found ${jobs.length} jobs`);

            // Process each job
            for (const job of jobs) {
                if (results.length >= maxJobs) break;

                await job.click();
                await sleep(2000);

                const details = await extractJobDetails(page);
                if (details.title) {
                    results.push(details);
                    await Actor.pushData(details);
                    console.log(`[INFO] Processed: ${details.title}`);
                }
            }

            // Check for next page
            const nextButton = await page.$('button[aria-label="Next"]');
            if (!nextButton || await page.evaluate(btn => btn.disabled, nextButton)) {
                console.log('[INFO] No more pages');
                break;
            }

            currentPage++;
            await sleep(2000);
        }

        return results;
    } catch (error) {
        console.error('[ERROR] Failed to scrape jobs:', error);
        throw error;
    }
}

async function extractJobDetails(page) {
    // Expand description
    try {
        const seeMoreButton = await page.$('.jobs-description__footer-button');
        if (seeMoreButton) await seeMoreButton.click();
    } catch (e) {}

    // Extract basic details
    const details = await page.evaluate(() => {
        const locationEl = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container');
        let location = '';
        let format = '';

        if (locationEl) {
            const fullText = locationEl.innerText.trim();
            const formatMatch = fullText.match(/\(([^)]+)\)/);
            format = formatMatch ? formatMatch[1].trim() : '';
            location = fullText.split('·')[0].replace(/\([^)]*\)/, '').trim();
        }

        return {
            title: document.querySelector('h1')?.innerText.trim() || '',
            company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
            link: window.location.href,
            location,
            format,
            description: document.querySelector('#job-details')?.innerText.trim() || ''
        };
    });

    // Handle apply button
    try {
        const applyButton = await page.$('.jobs-apply-button--top-card');
        if (applyButton) {
            const buttonText = await page.evaluate(button => button.textContent.trim(), applyButton);
            if (buttonText.includes('Candidatura simplificada')) {
                details.applyUrl = details.link;
            } else if (buttonText.includes('Candidatar-se')) {
                await applyButton.click();
                await sleep(2000);

                // Get URL from new tab
                const newPagePromise = new Promise(resolve => 
                    browser.once('targetcreated', target => resolve(target.page()))
                );
                const newPage = await newPagePromise;
                
                if (newPage) {
                    details.applyUrl = await newPage.url();
                    await newPage.close();
                } else {
                    details.applyUrl = details.link;
                }
            }
        } else {
            details.applyUrl = details.link;
        }
    } catch (e) {
        console.error('[ERROR] Error getting apply URL:', e);
        details.applyUrl = details.link;
    }

    return details;
}
