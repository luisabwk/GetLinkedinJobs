// routes.js
import { Dataset, createPuppeteerRouter } from 'crawlee';

export const router = createPuppeteerRouter();

router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
    log.info('Processing job listings page');

    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.linkedin.com/'
    });

    await page.setCookie({
        name: 'li_at',
        value: request.userData.li_at,
        domain: '.linkedin.com',
        secure: true,
        httpOnly: true
    });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font' || resourceType === 'stylesheet') {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        const response = await page.goto(request.url, {
            waitUntil: "domcontentloaded",
            timeout: 120000
        });

        if (response.status() === 429) {
            log.warning('Rate limit hit, waiting 30s...');
            await new Promise(r => setTimeout(r, 30000));
            throw new Error('Rate limited');
        }

        await page.waitForSelector('.scaffold-layout__list', {
            timeout: 30000,
            visible: true
        });

        let totalPages = 1;
        try {
            await page.waitForSelector(".artdeco-pagination__pages.artdeco-pagination__pages--number", { timeout: 20000 });
            totalPages = await page.$$eval(
                ".artdeco-pagination__pages.artdeco-pagination__pages--number li button",
                (buttons) => Math.max(...buttons.map((el) => parseInt(el.innerText.trim())).filter(n => !isNaN(n)))
            );
            log.info(`Total pages: ${totalPages}`);
        } catch (error) {
            log.warn("Could not get total pages, continuing with one page");
        }

        let allJobs = [];
        for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
            if (currentPage > 1) {
                const pageURL = request.url.replace(/&start=\d+/, '') + `&start=${(currentPage - 1) * 25}`;
                await page.goto(pageURL, { waitUntil: "domcontentloaded" });
                await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
            }

            const jobs = await page.evaluate(() => {
                return Array.from(document.querySelectorAll(".job-card-container--clickable"))
                    .map((job) => ({
                        title: job.querySelector(".job-card-list__title--link")?.innerText.trim().replace(/\n/g, " ") || '',
                        company: job.querySelector(".artdeco-entity-lockup__subtitle")?.innerText.trim() || '',
                        location: job.querySelector(".job-card-container__metadata-wrapper")?.innerText.trim().replace(/\(.*?\)/, "").trim() || '',
                        workType: job.querySelector(".job-card-container__metadata-wrapper")?.innerText.trim().match(/\(([^)]+)\)/)?.[1] || '',
                        url: job.querySelector("a")?.href || ''
                    }))
                    .filter(job => job.url);
            });

            allJobs = allJobs.concat(jobs);
            log.info(`Found ${jobs.length} jobs on page ${currentPage}`);

            const dataset = await Dataset.open();
            const datasetSize = await dataset.getInfo().then(info => info?.itemCount || 0);

            if (datasetSize >= request.userData.maxJobs || allJobs.length >= request.userData.maxJobs) {
                allJobs = allJobs.slice(0, request.userData.maxJobs);
                break;
            }

            if (currentPage < totalPages) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        for (const job of allJobs) {
            await enqueueLinks({
                urls: [job.url],
                userData: { 
                    label: 'DETAIL',
                    jobData: job,
                    li_at: request.userData.li_at
                }
            });
        }

    } catch (error) {
        log.error(`Failed to process listing: ${error.message}`);
        throw error;
    }
});

router.addHandler('DETAIL', async ({ request, page, log }) => {
    log.info(`Processing job details: ${request.url}`);

    await page.setBypassCSP(true);
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.linkedin.com/'
    });
    
    await page.setCookie({
        name: 'li_at',
        value: request.userData.li_at,
        domain: '.linkedin.com',
        secure: true,
        httpOnly: true
    });

    await page.evaluateOnNewDocument(() => {
        const originalOpen = window.open;
        window.open = function (...args) {
            window.__NEW_TAB_URL__ = args[0];
            return originalOpen.apply(window, args);
        };
    });

    try {
        const response = await page.goto(request.url, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        if (response.status() === 429) {
            log.warning('Rate limit hit, waiting 30s...');
            await new Promise(r => setTimeout(r, 30000));
            throw new Error('Rate limited');
        }

        await page.waitForSelector('#job-details', {
            timeout: 60000,
            visible: true
        });

        const seeMoreButton = await page.$('.jobs-description__footer-button');
        if (seeMoreButton) {
            await seeMoreButton.click();
            await new Promise(r => setTimeout(r, 1000));
        }

        let applyUrl = request.url;
        const applyButton = await page.$('.jobs-apply-button--top-card');
        
        if (applyButton) {
            const buttonText = await page.evaluate(button => button.textContent.trim(), applyButton);
            
            if (buttonText.includes("Candidatar-se")) {
                await applyButton.click();
                await new Promise(r => setTimeout(r, 3000));

                const newTabUrl = await page.evaluate(() => window.__NEW_TAB_URL__);
                if (newTabUrl) {
                    applyUrl = newTabUrl;
                } else {
                    const newPagePromise = new Promise(resolve => page.browser().once('targetcreated', target => resolve(target.page())));
                    const newPage = await newPagePromise;
                    if (newPage) {
                        applyUrl = await newPage.url();
                        await newPage.close();
                    }
                }
            }
        }

        const details = await page.evaluate(() => ({
            description: document.querySelector('#job-details')?.innerText.trim() || '',
            title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.innerText.trim() || '',
            company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText.trim() || '',
            location: document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.innerText.trim().split(' ·')[0].trim() || ''
        }));

        await Dataset.pushData({
            ...request.userData.jobData,
            ...details,
            applyUrl,
            scrapedAt: new Date().toISOString()
        });

    } catch (error) {
        log.error(`Failed to process job detail: ${error.message}`);
        throw error;
    }
});
