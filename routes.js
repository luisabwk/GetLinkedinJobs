// routes.js
import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function authenticate(page, li_at) {
    await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com',
        path: '/'
    });
}

export const Router = async ({ url, page, maxJobs, li_at }) => {
    const results = [];
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
        try {
            await page.setDefaultNavigationTimeout(120000);
            await authenticate(page, li_at);
            
            await page.goto(url, { 
                waitUntil: 'networkidle0',
                timeout: 120000 
            });
            
            await sleep(5000);
            
            const jobListExists = await page.evaluate(() => {
                return !!document.querySelector('.jobs-search-results-list');
            });
            
            if (!jobListExists) {
                console.log('Job list not found, retrying...');
                await sleep(5000);
                retries++;
                continue;
            }
            
            while (results.length < maxJobs) {
                const jobs = await page.$$('.jobs-search-results__list-item');
                if (!jobs.length) break;
                
                for (const job of jobs) {
                    if (results.length >= maxJobs) break;
                    
                    await job.click();
                    await sleep(2000);
                    
                    const details = await extractJobDetails(page);
                    results.push(details);
                    await Actor.pushData(details);
                }
                
                if (results.length < maxJobs) {
                    const hasNextPage = await goToNextPage(page);
                    if (!hasNextPage) break;
                }
            }
            
            break;
            
        } catch (error) {
            console.error(`Attempt ${retries + 1} failed:`, error);
            if (retries >= maxRetries - 1) throw error;
            retries++;
            await sleep(10000 * retries);
        }
    }
};

async function extractJobDetails(page) {
    try {
        const title = await page.$eval('h1', el => el.textContent.trim());
        const company = await page.$eval('.jobs-unified-top-card__company-name', 
            el => el.textContent.trim());
        const description = await page.$eval('#job-details', 
            el => el.textContent.trim());
        
        let applyUrl = '';
        try {
            const applyButton = await page.$('.jobs-apply-button--top-card');
            if (applyButton) {
                await applyButton.click();
                await page.waitForSelector('.jobs-apply-button', { timeout: 5000 });
                applyUrl = await page.evaluate(() => {
                    const link = document.querySelector('.jobs-apply-button');
                    return link ? link.href : '';
                });
            }
        } catch (e) {}
        
        return {
            title,
            company,
            description,
            applyUrl,
            url: page.url()
        };
    } catch (e) {
        console.error('Error extracting details:', e);
        return {
            title: '',
            company: '',
            description: '',
            applyUrl: '',
            url: page.url()
        };
    }
}

async function goToNextPage(page) {
    const nextButton = await page.$('button[aria-label="Next"]');
    if (!nextButton) return false;
    
    await nextButton.click();
    await sleep(3000);
    
    return true;
}
