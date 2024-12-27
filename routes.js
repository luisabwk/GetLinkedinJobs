// routes.js
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

    console.log('[INFO] Navigating to jobs page...');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await sleep(3000);

    const results = [];

    try {
        await page.waitForSelector('.jobs-search-results__list-item', { timeout: 10000 });
        
        while (results.length < maxJobs) {
            const jobs = await page.$$('.jobs-search-results__list-item');
            console.log(`[INFO] Found ${jobs.length} jobs on current page`);
            
            for (const job of jobs) {
                if (results.length >= maxJobs) break;

                await job.click();
                await sleep(2000);

                const jobDetails = await extractJobDetails(page);
                results.push(jobDetails);
                await Actor.pushData(jobDetails);

                console.log(`[INFO] Processed job: ${jobDetails.title}`);
            }

            if (results.length < maxJobs) {
                const hasNext = await goToNextPage(page);
                if (!hasNext) break;
                await sleep(2000);
            }
        }

        return results;
    } catch (error) {
        console.error('[ERROR] Failed to scrape jobs:', error);
        throw error;
    }
}

async function extractJobDetails(page) {
    const details = await page.evaluate(() => {
        const locationData = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.innerText.trim() || '';
        const formatMatch = locationData.match(/\(([^)]+)\)/);
        const format = formatMatch ? formatMatch[1].trim() : '';
        const location = locationData.replace(/\([^)]+\)/, '').trim();

        return {
            title: document.querySelector('h1')?.innerText.trim() || '',
            company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
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
        }
    } catch (e) {
        console.error('[ERROR] Error getting apply URL:', e);
        details.applyUrl = page.url();
    }

    return details;
}

async function goToNextPage(page) {
    const nextButton = await page.$('button[aria-label="Next"]');
    if (!nextButton) return false;
    
    await nextButton.click();
    await sleep(2000);
    
    return true;
}
