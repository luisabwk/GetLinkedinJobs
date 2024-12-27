import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJobListings(page, url, maxJobs, li_at) {
    // Setup page
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

    // Navigation with retry
    console.log('[INFO] Starting job search...');
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            console.log(`[INFO] Navigation attempt ${attempt + 1}/3`);
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 90000 
            });
            await sleep(3000);
            break;
        } catch (error) {
            console.warn(`[WARN] Navigation failed:`, error.message);
            if (attempt === 2) throw error;
            await sleep(5000);
        }
    }

    const results = [];

    try {
        // Wait for job listings to load
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                console.log('[INFO] Waiting for job list...');
                await page.waitForSelector('.scaffold-layout__list', { 
                    timeout: 30000,
                    visible: true 
                });
                
                await page.waitForSelector('.jobs-search-results-list', {
                    timeout: 10000,
                    visible: true
                });
                
                console.log('[INFO] Job list found');
                break;
            } catch (error) {
                console.warn(`[WARN] Attempt ${attempt + 1} - Failed to find job list:`, error.message);
                if (attempt === 2) throw error;
                await sleep(5000);
            }
        }
        
        // Process jobs
        while (results.length < maxJobs) {
            const jobs = await page.$$('.job-card-container');
            console.log(`[INFO] Found ${jobs.length} jobs on current page`);
            
            for (const job of jobs) {
                if (results.length >= maxJobs) break;

                await job.click();
                await sleep(2000);

                const jobDetails = await extractJobDetails(page);
                if (jobDetails.title) {
                    results.push(jobDetails);
                    await Actor.pushData(jobDetails);
                    console.log(`[INFO] Processed job: ${jobDetails.title} - ${jobDetails.company}`);
                }
            }

            if (results.length < maxJobs) {
                const hasNext = await goToNextPage(page);
                if (!hasNext) {
                    console.log('[INFO] No more pages available');
                    break;
                }
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
    try {
        // Expand description if needed
        const seeMoreButton = await page.$('.jobs-description__footer-button');
        if (seeMoreButton) {
            await seeMoreButton.click();
            await sleep(1000);
        }
    } catch (e) {}

    // Extract basic details
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
            console.log(`[INFO] Found apply button: "${buttonText}"`);
            
            if (buttonText.includes('Candidatura simplificada')) {
                console.log('[INFO] Simplified application - using job URL');
                details.applyUrl = page.url();
            } else if (buttonText.includes('Candidatar-se')) {
                console.log('[INFO] External application - getting redirect URL');
                await applyButton.click();
                await sleep(2000);

                // Setup window.open interceptor
                await page.evaluateOnNewDocument(() => {
                    window.open = function(...args) {
                        window.__NEW_TAB_URL__ = args[0];
                    };
                });

                const newPagePromise = new Promise(resolve => 
                    browser.once('targetcreated', target => resolve(target.page()))
                );
                const newPage = await newPagePromise;
                
                if (newPage) {
                    details.applyUrl = await newPage.url();
                    console.log('[INFO] Got external application URL');
                    await newPage.close();
                }
            }
        } else {
            console.log('[INFO] No apply button found, using job URL');
            details.applyUrl = page.url();
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
