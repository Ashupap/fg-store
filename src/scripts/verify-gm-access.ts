
import { loginUser } from '../lib/auth';
import { getDb } from '../lib/db';

async function verifyGMAccess() {
    console.log('--- Verifying General Manager Access ---');

    // 1. Login as GM
    const login = await loginUser('gm', 'gm');
    // Assuming 'gm' user exists with password 'gm'. If not, we might need to create or reset.
    // Based on previous user list, 'gm' exists. Password likely 'gm'.

    if (!login.success) {
        console.error('❌ Failed to login as GM:', login.error);
        return;
    }
    console.log('✅ Logged in as GM');

    // Helper to simulate request (we can't easily fetch via HTTP in this script environment without huge overhead, 
    // but we can check the logic or use fetch if the server is running.
    // Since server is running on localhost:3000, we can use fetch.)

    const cookie = `auth-token=${login.token}`;
    const baseUrl = 'http://localhost:3000';

    async function checkRoute(method: string, path: string, expectedStatus: number) {
        try {
            const res = await fetch(`${baseUrl}${path}`, {
                method,
                headers: { 'Cookie': cookie, 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify({ name: 'Test Store', type: 'Cold Store' }) : undefined
            });

            if (res.status === expectedStatus) {
                console.log(`✅ [${method}] ${path} returned ${res.status} (Expected)`);
            } else {
                console.error(`❌ [${method}] ${path} returned ${res.status} (Expected ${expectedStatus})`);
            }
        } catch (e) {
            console.error(`❌ Request failed: ${e}`);
        }
    }

    await checkRoute('GET', '/api/admin/stores', 200);
    await checkRoute('GET', '/api/admin/varieties', 200); // Resource route
    await checkRoute('GET', '/api/admin/users', 403);

    // Check write access
    // await checkRoute('POST', '/api/admin/stores', 200); // Be careful creating garbage
}

verifyGMAccess();
