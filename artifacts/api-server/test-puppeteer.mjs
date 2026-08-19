import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.goto("https://www.google.com", {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });
  await page.screenshot({ path: "test.png", fullPage: true });
  console.log(`Puppeteer smoke test passed: ${await page.title()}`);
  console.log("Screenshot saved to test.png");
} finally {
  await browser.close();
}