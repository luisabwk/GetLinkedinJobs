// routes.js
import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkForBlockPage(page) {
    return page.evaluate(() => {
        return document.body.textContent.includes('Sign in') 
            || document.body.textContent.includes('Security Verification');
    });
}

export const Router = async ({ url, page, maxJobs }) => {
    const results = [];
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
        try {
            await page.setDefaultNavigationTimeout(120000);
            await page.goto(url, { 
                waitUntil: 'networkidle0',
                timeout: 120000 
            });
            
            await sleep(5000);
            
            const isBlocked = await checkForBlockPage(page);
            if (isBlocked) {
                console.log('Detected block/login page, retrying...');
                await sleep(10000);
                retries++;
                continue;
            }
            
            console.log('Page content:', await page.content());
            const jobListExists = await page.evaluate(() => {
                return !!document.querySelector('.scaffold-layout__list') 
                    || !!document.querySelector('.jobs-search-results-list');
            });
            
            if (!jobListExists) {
                throw new Error('Job list not found');
            }
            
            while (results.length < maxJobs) {
                const jobs = await page.$$('.jobs-search-results__list-item');
                if (!jobs.length) break;
                
                for (const job of jobs) {
                    if (results.length >= maxJobs) break;
                    
                    await job.click();
                    await sleep(2000);
                    
                    if (await page.$('#job-details')) {
                        const details = await extractJobDetails(page);
                        results.push(details);
                        await Actor.pushData(details);
                    }
                    
                    await sleep(1000);
                }
                
                if (results.length < maxJobs) {
                    const hasNextPage = await goToNextPage(page);
                    if (!hasNextPage) break;
                }
            }
            
            break; // Success, exit retry loop
            
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
        const company = await page.$eval('.jobs-unified-top-card__company-name', el => el.textContent.trim());
        const description = await page.$eval('#job-details', el => el.textContent.trim());
        
        let applyUrl = '';
        const applyButton = await page.$('.jobs-apply-button--top-card');
        if (applyButton) {
            await applyButton.click();
            await sleep(1000);
            const link = await page.$('.jobs-apply-button');
            if (link) {
                applyUrl = await page.evaluate(el => el.href, link);
            }
        }
        
        return {
            title,
            company,
            description,
            applyUrl,
            url: page.url()
        };
    } catch (e) {
        return {
            title: 'Error extracting details',
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
