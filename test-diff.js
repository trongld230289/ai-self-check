// Test diff module
console.log('Testing diff module...');

try {
    const diff = require('./diff');
    console.log('✅ diff module loaded successfully');
    console.log('Available methods:', Object.keys(diff));
    
    // Test diffLines function
    if (diff.diffLines) {
        const result = diff.diffLines('line1\nline2', 'line1\nline3');
        console.log('✅ diffLines working:', result.length > 0);
    } else {
        console.log('❌ diffLines not found');
    }
} catch (error) {
    console.log('❌ Error loading diff:', error.message);
    console.log('Stack:', error.stack);
}