
async function checkGuide() {
    console.log("Checking /guide access...");
    try {
        const res = await fetch('http://localhost:3000/guide', { redirect: 'manual' });
        console.log(`Status: ${res.status}`);
        if (res.status >= 300 && res.status < 400) {
            console.log(`Redirect Location: ${res.headers.get('location')}`);
        } else {
            console.log("Headers:", Object.fromEntries(res.headers.entries()));
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
checkGuide();
