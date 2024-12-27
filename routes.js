export async function getJobListings(page, jobUrl) {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Expand description if needed
    try {
        const seeMoreButton = await page.$('.jobs-description__footer-button');
        if (seeMoreButton) {
            await seeMoreButton.click();
            console.log("[INFO] Expanded job description");
        }
    } catch (e) {
        console.log("[WARN] No description expansion needed");
    }

    // Extract basic details
    const details = await page.evaluate(() => {
        const locationData = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')?.innerText.trim() || '';
        const description = document.querySelector('#job-details')?.innerText.trim() || '';
        
        // Parse location and format
        const formatMatch = locationData.match(/\(([^)]+)\)/);
        const format = formatMatch ? formatMatch[1].trim() : '';
        const location = locationData.replace(/\([^)]+\)/, '').trim();
        
        return { description, location, format };
    });

    // Get apply URL
    let applyUrl = jobUrl;
    console.log(`[INFO] Processing application URL for: ${jobUrl}`);
    
    try {
        await page.evaluateOnNewDocument(() => {
            window.open = (...args) => { window.__NEW_TAB_URL__ = args[0]; };
        });

        const applyButton = await page.$('.jobs-apply-button--top-card');
        if (applyButton) {
            const buttonText = await page.evaluate(button => button.textContent.trim(), applyButton);
            console.log(`[INFO] Found apply button: "${buttonText}"`);

            if (buttonText.includes('Candidatura simplificada')) {
                console.log('[INFO] Simplified application - using job URL');
                applyUrl = jobUrl;
            } else if (buttonText.includes('Candidatar-se')) {
                console.log('[INFO] External application - getting redirect URL');
                await applyButton.click();
                await page.waitForTimeout(3000);

                const newPagePromise = new Promise(resolve => 
                    browser.once('targetcreated', target => resolve(target.page()))
                );
                const newPage = await newPagePromise;
                
                if (newPage) {
                    applyUrl = await newPage.url();
                    console.log('[INFO] Got URL from new tab:', applyUrl);
                    await newPage.close();
                }
            }
        } else {
            console.log('[INFO] No apply button found, using job URL');
        }
    } catch (e) {
        console.error('[ERROR] Error getting apply URL:', e.message);
    }

    return {
        ...details,
        applyUrl
    };
}
