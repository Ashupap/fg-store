
import { createUser } from '../lib/auth';
import { getDb } from '../lib/db';

async function createMarketingUser() {
    try {
        console.log('Creating marketing user...');
        const result = await createUser('marketing', 'marketing@fgstore.com', 'marketing', 'Marketing Manager', 'marketing_manager');

        if (result.success) {
            console.log('✅ Marketing user created successfully.');
            console.log('Username: marketing');
            console.log('Password: marketing');
        } else {
            console.error('❌ Failed to create user:', result.error);
        }
    } catch (error) {
        console.error('❌ Script error:', error);
    }
}

createMarketingUser();
