import { Actor } from 'apify';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJobListings(browser, searchTerm, location, li_at, maxJobs) {
    console.log("[INFO] Starting job scraping...");
    const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`;
    const allJobLinks = [];
    let currentPage = 1;

    while (allJobLinks.length < maxJobs) {
        const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl}&start=${(currentPage - 1) * 25}`;
        console.log(`[INFO] Navigating to page ${currentPage}: ${pageUrl}`);

        let page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        );

        await page.setCookie({
            name: "li_at",
            value: li_at,
            domain: ".linkedin.com",
        });

        try {
            await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            console.log("[INFO] Page loaded successfully.");

            // Wait for job list container
            await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });

            // Debug DOM content to verify structure
            const contentHtml = await page.content();
            console.log("[DEBUG] Page HTML snapshot captured.");

            // Extract job links
            const jobLinks = await page.evaluate(() => {
                const jobElements = Array.from(document.querySelectorAll('.job-card-container--clickable'));
                return jobElements.map(el => el.querySelector('a')?.href).filter(href => href && href.includes('/jobs/view/'));
            });

            console.log(`[INFO] Found ${jobLinks.length} job links on page ${currentPage}`);
            jobLinks.forEach(link => {
                if (!allJobLinks.includes(link)) allJobLinks.push(link);
            });

            // Check if there are more pages
            const nextButton = await page.$('button[aria-label="Next"]');
            const isDisabled = await page.evaluate(btn => btn?.disabled, nextButton);

            if (!nextButton || isDisabled) {
                console.log('[INFO] No more pages.');
                break;
            }

            currentPage++;
        } catch (error) {
            console.error(`[ERROR] Error on page ${currentPage}: ${error.message}`);
            break;
        } finally {
            await page.close();
        }

        if (allJobLinks.length >= maxJobs) {
            console.log("[INFO] Reached max job limit.");
            break;
        }
    }

    console.log(`[INFO] Total job links collected: ${allJobLinks.length}`);
    const jobs = [];

    // Process each job link for details
    for (const jobUrl of allJobLinks.slice(0, maxJobs)) {
        console.log(`[INFO] Fetching details for job: ${jobUrl}`);
        try {
            const jobDetails = await extractJobDetails(browser, jobUrl, li_at);
            jobs.push(jobDetails);
            console.log(`[INFO] Job processed: ${jobDetails.title}`);
        } catch (error) {
            console.error(`[ERROR] Failed to process job: ${error.message}`);
        }
    }

    return jobs;
}

async function extractJobDetails(browser, jobUrl, li_at) {
    console.log(`[INFO] Accessing job details: ${jobUrl}`);
    let page = null;
    let jobDetails = {};

    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        );

        await page.setCookie({ name: "li_at", value: li_at, domain: ".linkedin.com" });
        await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

        // Expand full job description
        const seeMoreSelector = ".jobs-description__footer-button";
        try {
            await page.waitForSelector(seeMoreSelector, { timeout: 5000 });
            await page.click(seeMoreSelector);
        } catch {
            console.warn("[WARN] 'See more' button not found.");
        }

        // Extract job details
        jobDetails = await page.evaluate(() => {
            const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
            let location = "";
            let format = "";

            if (locationData) {
                const formatMatch = locationData.match(/\(([^)]+)\)/);
                format = formatMatch ? formatMatch[1].trim() : "";
                location = locationData.replace(/\(.*?\)/, "").trim();
            }

            return {
                title: document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "",
                company: document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "",
                location,
                format,
                description: document.querySelector("#job-details")?.innerText.trim() || "",
                applyUrl: null
            };
        });

        // Handle apply URL
        const applyButton = await page.$(".jobs-apply-button--top-card");
        if (applyButton) {
            const buttonText = await page.evaluate(btn => btn.textContent.trim(), applyButton);
            if (buttonText.includes("Candidatura simplificada")) {
                jobDetails.applyUrl = jobUrl;
            } else if (buttonText.includes("Candidatar-se")) {
                await applyButton.click();
                await sleep(2000);
                const newPage = await browser.waitForTarget(t => t.url() !== jobUrl);
                jobDetails.applyUrl = newPage?.url() || jobUrl;
            }
        } else {
            jobDetails.applyUrl = jobUrl;
        }

        return jobDetails;
    } catch (error) {
        console.error(`[ERROR] Failed to extract job details: ${error.message}`);
        throw error;
    } finally {
        if (page) await page.close();
    }
}
