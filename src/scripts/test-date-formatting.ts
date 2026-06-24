import { formatDisplayDate, formatDisplayDateTime } from '../lib/utils';

console.log('=== Starting Date Formatting Unit Tests ===');

let pass = true;

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ Failure: ${message}`);
        pass = false;
    } else {
        console.log(`✅ Success: ${message}`);
    }
}

// 1. Test formatDisplayDate
assert(formatDisplayDate(null) === 'N/A', 'Null date formats to N/A');
assert(formatDisplayDate(undefined) === 'N/A', 'Undefined date formats to N/A');
assert(formatDisplayDate('') === 'N/A', 'Empty string formats to N/A');

assert(formatDisplayDate('2025-01-15') === '15-01-2025', 'Simple ISO date string (YYYY-MM-DD) formats correctly');
assert(formatDisplayDate('2025-12-05T00:00:00.000Z') === '05-12-2025', 'UTC ISO timestamp formats correctly without shift');
assert(formatDisplayDate('2025-06-11 08:30:15') === '11-06-2025', 'Space-separated date-time string formats correctly');
assert(formatDisplayDate('11-06-2025') === '11-06-2025', 'Already formatted date returns as is');

const dateObj = new Date(Date.UTC(2025, 2, 24)); // March 24, 2025
// Note: formatDisplayDate for a local Date object parses locally, so let's verify local representation
const expectedDay = String(dateObj.getDate()).padStart(2, '0');
const expectedMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
const expectedYear = dateObj.getFullYear();
const expectedLocalStr = `${expectedDay}-${expectedMonth}-${expectedYear}`;
assert(formatDisplayDate(dateObj) === expectedLocalStr, 'JavaScript Date object formats correctly based on local components');

// 2. Test formatDisplayDateTime
assert(formatDisplayDateTime(null) === 'N/A', 'Null datetime formats to N/A');
assert(formatDisplayDateTime('2025-01-15T14:30:45.000Z') !== 'N/A', 'Valid ISO datetime parses');

const dateTimeStr = '2025-01-15T14:30:45';
const dt = new Date(dateTimeStr);
if (!isNaN(dt.getTime())) {
    const expDay = String(dt.getDate()).padStart(2, '0');
    const expMonth = String(dt.getMonth() + 1).padStart(2, '0');
    const expYear = dt.getFullYear();
    const expHours = String(dt.getHours()).padStart(2, '0');
    const expMins = String(dt.getMinutes()).padStart(2, '0');
    const expSecs = String(dt.getSeconds()).padStart(2, '0');
    const expectedDateTimeStr = `${expDay}-${expMonth}-${expYear} ${expHours}:${expMins}:${expSecs}`;
    assert(formatDisplayDateTime(dateTimeStr) === expectedDateTimeStr, 'DateTime string formats correctly to local components');
}

if (pass) {
    console.log('\n=== All Date Formatting Unit Tests Passed Successfully ===');
    process.exit(0);
} else {
    console.error('\n❌ Some tests failed.');
    process.exit(1);
}
