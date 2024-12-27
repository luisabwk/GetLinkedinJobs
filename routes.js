// routes.js
import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function prepareRequestInterception(page) {
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
}

export async function getJobListings({ browser, searchTerm, location, li_at, maxJobs }) {
    const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`;
    const results = [];
    let page = null;

    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
        await page.setCookie({
            name: 'li_at',
            value: li_at,
            domain: '.linkedin.com'
        });

        await prepareRequestInterception(page);
        
        let currentPage = 0;
        
        while (results.length < maxJobs) {
            const pageUrl = currentPage === 0 ? baseUrl : `${baseUrl}&start=${currentPage * 25}`;
            
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
                    break;
                } catch (error) {
                    if (attempt === 2) throw error;
                    await sleep(5000);
                }
            }
            
            const pageJobs = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.job-card-container--clickable'))
                    .map(job => {
                        const title = job.querySelector('.job-card-list__title--link')?.innerText.trim();
                        const company = job.querySelector('.artdeco-entity-lockup__subtitle')?.innerText.trim();
                        const locationEl = job.querySelector('.job-card-container__metadata-wrapper');
                        const location = locationEl?.innerText.trim();
                        const link = job.querySelector('a')?.href;
                        
                        return { title, company, location, link };
                    });
            });
            
            for (const job of pageJobs) {
                if (results.length >= maxJobs) break;
                if (job.link) {
                    const jobDetails = await getJobDetails(page, job.link);
                    results.push({
                        ...job,
                        ...jobDetails
                    });
                    await Actor.pushData(results[results.length - 1]);
                }
            }
            
            const hasNext = await page.evaluate(() => {
                const button = document.querySelector('button[aria-label="Next"]');
                return button && !button.disabled;
            });
            
            if (!hasNext) break;
            currentPage++;
            await sleep(2000);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        if (page) await page.close();
    }
}

async function getJobDetails(page, jobUrl) {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    try {
        const seeMoreButton = await page.$('.jobs-description__footer-button');
        if (seeMoreButton) await seeMoreButton.click();
    } catch (e) {}

    return page.evaluate(() => {
        const description = document.querySelector('#job-details')?.innerText.trim() || '';
        const applyButton = document.querySelector('.jobs-apply-button--top-card');
        const format = document.querySelector('.job-details-jobs-unified-top-card__workplace-type')?.innerText.trim() || '';
        
        return {
            description,
            format,
            hasApplyButton: !!applyButton
        };
    });
}
