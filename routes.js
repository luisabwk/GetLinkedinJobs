// routes.js
const RATE_LIMIT_DELAY = 10000;

router.addHandler('LIST', async ({ request, page, log, enqueueLinks }) => {
    log.info('Processing job listings page');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    
    await page.setCookie({
        name: 'li_at', 
        value: request.userData.li_at,
        domain: '.linkedin.com'
    });

    const response = await page.goto(request.url, {
        waitUntil: 'networkidle2',
        timeout: 90000
    });

    if (response.status() === 429) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        throw new Error('Rate limited - retrying after delay');
    }

    // Rest of the code remains the same
});
