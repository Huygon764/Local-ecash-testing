const { exec } = require('child_process');

const INTERVAL_MINUTES = 60; // Change this to your desired interval

function runTests() {
  console.log(`\n[${new Date().toLocaleString()}] Running Playwright tests...`);
  
  const testProcess = exec('npx playwright test', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      return;
    }
    console.log(stdout);
    if (stderr) console.error(stderr);
  });

  testProcess.stdout.pipe(process.stdout);
  testProcess.stderr.pipe(process.stderr);
}

// Run tests immediately
runTests();

// Schedule subsequent runs
console.log(`Tests will run every ${INTERVAL_MINUTES} minutes`);
setInterval(runTests, INTERVAL_MINUTES * 60 * 1000);
