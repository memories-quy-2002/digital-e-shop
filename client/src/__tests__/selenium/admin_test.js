const { By, Key, Builder, until } = require("selenium-webdriver");
require("chromedriver");
const PORT = 5173

async function adminDashboardTest() {
    // Start browser
    let driver = await new Builder().forBrowser("chrome").build();

    try {
        // Navigate to Admin Dashboard
        await driver.get(`http://localhost:${PORT}/admin`); // Change to your actual local or deployed URL

        // Wait until dashboard header appears
        await driver.wait(
            until.elementLocated(By.xpath("//*[contains(text(),'📊 Admin Dashboard Overview')]")),
            10000
        );
        console.log("✅ Admin Dashboard loaded successfully.");

        // Verify Summary section exists
        await driver.wait(
            until.elementLocated(By.xpath("//*[contains(text(),'Summary (This Month)')]")),
            5000
        );
        console.log("✅ Summary section is visible.");

        // Verify Sales Over Time chart is present
        await driver.wait(
            until.elementLocated(By.xpath("//*[contains(text(),'Sales Over Time')]")),
            5000
        );
        console.log("✅ Sales Over Time chart is visible.");

        // Verify Revenue Over Time chart is present
        await driver.wait(
            until.elementLocated(By.xpath("//*[contains(text(),'Revenue Over Time')]")),
            5000
        );
        console.log("✅ Revenue Over Time chart is visible.");

        // Click the Download Detailed Report button
        let downloadButton = await driver.findElement(
            By.xpath("//button[contains(text(),'Download Detailed Report')]")
        );
        await downloadButton.click();
        console.log("✅ Download Detailed Report button clicked.");

        // Verify Top 10 Best-Selling Products table
        await driver.wait(
            until.elementLocated(By.xpath("//*[contains(text(),'Top 10 Best-Selling Products')]")),
            5000
        );
        console.log("✅ Top 10 Best-Selling Products table is visible.");

    } catch (err) {
        console.error("❌ Test failed:", err);
    } finally {
        // Close browser
        await driver.quit();
    }
}

adminDashboardTest();
