async function runTests() {
    console.log('=== Starting Logout Verification ===\n');

    const baseUrl = 'http://localhost:3000';

    // 1. Test POST logout
    console.log('Testing POST /api/auth/logout...');
    try {
        const postRes = await fetch(`${baseUrl}/api/auth/logout`, {
            method: 'POST'
        });
        const postData = await postRes.json() as any;
        const setCookie = postRes.headers.get('set-cookie');

        console.log(`  Response Status: ${postRes.status}`);
        console.log(`  Response Data:`, postData);
        console.log(`  Set-Cookie Header:`, setCookie);

        if (postRes.status === 200 && postData.success === true && setCookie && setCookie.toLowerCase().includes('max-age=0')) {
            console.log('  ✅ POST Logout Success: Cookie cleared and JSON returned.');
        } else {
            console.error('  ❌ POST Logout FAILED.');
            process.exit(1);
        }
    } catch (err) {
        console.error('  ❌ POST request failed:', err);
        process.exit(1);
    }

    console.log('\nTesting GET /api/auth/logout...');
    try {
        // We set redirect: 'manual' so we can inspect the redirect headers without following them
        const getRes = await fetch(`${baseUrl}/api/auth/logout`, {
            method: 'GET',
            redirect: 'manual'
        });
        const setCookie = getRes.headers.get('set-cookie');
        const location = getRes.headers.get('location');

        console.log(`  Response Status: ${getRes.status}`);
        console.log(`  Redirect Location: ${location}`);
        console.log(`  Set-Cookie Header:`, setCookie);

        // Status 307 or 302 or 303 are normal redirect codes in Next.js
        if ((getRes.status === 307 || getRes.status === 302 || getRes.status === 303) && location && location.includes('/login') && setCookie && setCookie.toLowerCase().includes('max-age=0')) {
            console.log('  ✅ GET Logout Success: Cookie cleared and redirected to /login.');
        } else {
            console.error('  ❌ GET Logout FAILED.');
            process.exit(1);
        }
    } catch (err) {
        console.error('  ❌ GET request failed:', err);
        process.exit(1);
    }

    console.log('\n🎉 All logout tests PASSED successfully!');
    process.exit(0);
}

runTests();
