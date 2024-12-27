// routes.js
export const Router = async ({ request, page, log }) => {
    const { maxJobs } = request.userData;
    const results = [];
    
    try {
        await page.waitForSelector('.scaffold-layout__list', { timeout: 10000 });
        
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
        log.error('Scraping failed:', error);
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
    await page.waitForTimeout(1000); // Rate limiting protection
    
    return true;
}

// INPUT_SCHEMA.json
{
    "title": "LinkedIn Jobs Scraper",
    "type": "object",
    "schemaVersion": 1,
    "properties": {
        "searchTerm": {
            "title": "Search Term",
            "type": "string",
            "description": "Job search keyword",
            "editor": "textfield"
        },
        "location": {
            "title": "Location",
            "type": "string",
            "description": "Job location",
            "editor": "textfield"
        },
        "li_at": {
            "title": "LinkedIn Cookie",
            "type": "string",
            "description": "LinkedIn authentication cookie value",
            "editor": "textfield"
        },
        "maxJobs": {
            "title": "Maximum Jobs",
            "type": "integer",
            "description": "Maximum number of jobs to scrape",
            "default": 25,
            "minimum": 1,
            "maximum": 1000
        },
        "maxConcurrency": {
            "title": "Max Concurrency",
            "type": "integer",
            "description": "Maximum concurrent requests",
            "default": 5,
            "minimum": 1,
            "maximum": 10
        },
        "timeout": {
            "title": "Timeout",
            "type": "integer",
            "description": "Request timeout in milliseconds",
            "default": 30000,
            "minimum": 10000,
            "maximum": 60000
        }
    },
    "required": ["searchTerm", "location", "li_at"]
}
