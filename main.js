// routes.js adjusted LIST handler
router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
    const delayTime = Math.pow(2, request.retryCount || 0) * 1000;
    await new Promise(r => setTimeout(r, delayTime));

    log.info('Processing job listings page');
    const { maxJobs } = request.userData;
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
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
        if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
        // Rest of the code stays the same...
