import { loginUser } from '../lib/auth';

async function runTests() {
    console.log('=== Starting Dashboard Access Restrictions Verification ===\n');

    const baseUrl = 'http://localhost:3000';

    // 1. Login as Admin (who should NOT have access)
    console.log('Logging in as Admin (username: "admin")...');
    const adminLogin = await loginUser('admin', 'admin');
    if (!adminLogin.success) {
        console.error('❌ Failed to login as Admin:', adminLogin.error);
        process.exit(1);
    }
    console.log('✅ Logged in as Admin successfully.\n');

    // 2. Login as Operator (who SHOULD have access)
    console.log('Logging in as Operator (username: "operator")...');
    const operatorLogin = await loginUser('operator', 'operator');
    if (!operatorLogin.success) {
        console.error('❌ Failed to login as Operator:', operatorLogin.error);
        process.exit(1);
    }
    console.log('✅ Logged in as Operator successfully.\n');

    const adminCookie = `auth-token=${adminLogin.token}`;
    const operatorCookie = `auth-token=${operatorLogin.token}`;

    const endpoints = [
        '/api/dashboard',
        '/api/dashboard/capacity',
        '/api/dashboard/export',
        '/api/dashboard/filter-options',
    ];

    let allPassed = true;

    for (const endpoint of endpoints) {
        console.log(`Testing endpoint: ${endpoint}`);

        // Test Admin (expected 403 Forbidden)
        try {
            const adminRes = await fetch(`${baseUrl}${endpoint}`, {
                headers: { 'Cookie': adminCookie }
            });
            if (adminRes.status === 403) {
                console.log(`  ✅ Admin Access: Restricted (returned 403 as expected)`);
            } else {
                console.error(`  ❌ Admin Access: FAILED (returned ${adminRes.status}, expected 403)`);
                allPassed = false;
            }
        } catch (err) {
            console.error(`  ❌ Admin Access: Request failed:`, err);
            allPassed = false;
        }

        // Test Operator (expected 200 OK or similar success/redirect, but not 403/401)
        try {
            const operatorRes = await fetch(`${baseUrl}${endpoint}`, {
                headers: { 'Cookie': operatorCookie }
            });
            if (operatorRes.status === 200 || operatorRes.status === 302) {
                console.log(`  ✅ Operator Access: Permitted (returned ${operatorRes.status})`);
            } else {
                console.error(`  ❌ Operator Access: FAILED (returned ${operatorRes.status}, expected 200/302)`);
                allPassed = false;
            }
        } catch (err) {
            console.error(`  ❌ Operator Access: Request failed:`, err);
            allPassed = false;
        }
        console.log('');
    }

    if (allPassed) {
        console.log('🎉 All tests PASSED successfully! Dashboard restrictions are strictly enforced.');
        process.exit(0);
    } else {
        console.error('❌ Some tests FAILED. Please check logs.');
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal error during verification:', err);
    process.exit(1);
});
