// routes.js
import { Actor } from 'apify';

export const Router = async ({ url, page, maxJobs }) => {
    const results = [];
    
    try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForTimeout(3000);
        await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
        
        while (results.length < maxJobs) {
            const jobs = await page.$$('.jobs-search-results__list-item');
            
            for (const job of jobs) {
                if (results.length >= maxJobs) break;
                
                await job.click();
                await page.waitForSelector('#job-details', { timeout: 5000 });
                
                const details = await extractJobDetails(page);
                results.push(details);
                
                await Actor.pushData(details);
            }
            
            if (results.length < maxJobs) {
                const hasNextPage = await goToNextPage(page);
                if (!hasNextPage) break;
            }
        }
    } catch (error) {
        console.error('Scraping failed:', error);
        throw error;
    }
};

async function extractJobDetails(page) {
    const title = await page.$eval('h1', el => el.textContent.trim());
    const company = await page.$eval('.jobs-unified-top-card__company-name', el => el.textContent.trim());
    const description = await page.$eval('#job-details', el => el.textContent.trim());
    
    let applyUrl = '';
    try {
        const applyButton = await page.$('.jobs-apply-button--top-card');
        if (applyButton) {
            await applyButton.click();
            await page.waitForSelector('.jobs-apply-button', { timeout: 3000 });
            applyUrl = await page.evaluate(() => {
                const link = document.querySelector('.jobs-apply-button');
                return link ? link.href : '';
            });
        }
    } catch (e) {
        // Application url not available
    }
    
    return {
        title,
        company,
        description,
        applyUrl,
        url: page.url()
    };
}

async function goToNextPage(page) {
    const nextButton = await page.$('button[aria-label="Next"]');
    if (!nextButton) return false;
    
    await nextButton.click();
    await page.waitForSelector('.scaffold-layout__list');
    await page.waitForTimeout(1000);
    
    return true;
}
