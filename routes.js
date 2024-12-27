import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function authenticate(page, li_at) {
    await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com',
        path: '/',
    });
}

export const Router = async ({ url, page, maxJobs, li_at }) => {
    const results = [];
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
        try {
            await page.setDefaultNavigationTimeout(120000);
            
            // Set cookie before navigation
            const li_at = await Actor.getValue('li_at');
            await authenticate(page, li_at);
            
            await page.goto(url, { 
                waitUntil: 'networkidle0',
                timeout: 120000 
            });
            
            await sleep(5000);
            
            // Check authentication
            const isAuthWall = await page.evaluate(() => {
                return document.body.textContent.includes('Cadastre-se') || 
                       document.body.textContent.includes('Sign in');
            });

            if (isAuthWall) {
                console.log('Auth wall detected, retrying with new cookie...');
                retries++;
                await sleep(10000);
                continue;
            }

            // Extract jobs
            while (results.length < maxJobs) {
                await sleep(3000);
                const jobs = await page.$$('.job-card-container');
                
                if (!jobs.length) {
                    const noResults = await page.evaluate(() => {
                        return document.body.textContent.includes('Não encontramos') ||
                               document.body.textContent.includes('No results found');
                    });
                    if (noResults) break;
                }

                for (const job of jobs) {
                    if (results.length >= maxJobs) break;
                    
                    await job.click();
                    await sleep(2000);
                    
                    const details = await extractJobDetails(page);
                    if (details.title) {
                        results.push(details);
                        await Actor.pushData(details);
                    }
                }
                
                if (results.length < maxJobs) {
                    const hasNextPage = await goToNextPage(page);
                    if (!hasNextPage) break;
                }
            }
            
            break; // Success
            
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
        const company = await page.$eval('.job-details-jobs-unified-top-card__company-name', 
            el => el.textContent.trim());
        const description = await page.$eval('.job-details-jobs-unified-top-card__job-insight', 
            el => el.textContent.trim());
        
        let applyUrl = '';
        try {
            const applyButton = await page.$('.sign-up-modal__outlet');
            if (applyButton) {
                const href = await page.evaluate(el => el.getAttribute('href'), applyButton);
                applyUrl = href || '';
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
        return {};
    }
}

async function goToNextPage(page) {
    const nextButton = await page.$('button[aria-label="Avançar"]');
    if (!nextButton) return false;
    
    await nextButton.click();
    await sleep(3000);
    
    return true;
}
