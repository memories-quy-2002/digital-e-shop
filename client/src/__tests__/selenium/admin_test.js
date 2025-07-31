const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const assert = require('assert');

describe('Admin UI Selenium Tests', function () {
    let driver;
    const baseUrl = 'http://localhost:5173'; // Change if your dev server runs elsewhere
    this.timeout(30000);

    before(async () => {
        const options = new chrome.Options();
        driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
        await driver.manage().setTimeouts({ implicit: 10000 });
    });

    after(async () => {
        await driver.quit();
    });

    async function loginAsAdmin() {
        await driver.get(`${baseUrl}/login`);
        await driver.findElement(By.css('input[placeholder="Email"]')).sendKeys('test2@gmail.com');
        await driver.findElement(By.css('input[placeholder="Password"]')).sendKeys('Phuquy2002@');
        await driver.findElement(By.xpath('//*[@id="root"]/div[1]/div/main/form/button')).click();
        await driver.wait(until.elementLocated(By.xpath('//*[@id="root"]/div[1]/header/div[1]/div[2]/strong')), 10000);
    }

    it.only('should load the admin dashboard', async () => {
        await loginAsAdmin();
        await driver.get(`${baseUrl}/admin`);
        const salesElem = await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Sales Over Time')]")), 10000);
        assert.ok(await salesElem.isDisplayed());
    });

    it('should show product list and filter by search', async () => {
        await loginAsAdmin();
        await driver.get(`${baseUrl}/admin/products`);
        const electronicsElem = await driver.findElement(By.xpath("//*[contains(text(), 'Electronics')]"));
        assert.ok(await electronicsElem.isDisplayed());
        const searchInput = await driver.findElement(By.css('input[placeholder="Search product"]'));
        await searchInput.clear();
        await searchInput.sendKeys('Electronics', Key.RETURN);
        await driver.wait(until.elementIsNotVisible(driver.findElement(By.xpath("//*[contains(text(), 'Fashion')]"))), 5000);
        assert.ok(await electronicsElem.isDisplayed());
    });

    it('should add a product', async () => {
        await loginAsAdmin();
        await driver.get(`${baseUrl}/admin/add`);
        await driver.findElement(By.css('input[aria-label="Product name"]')).sendKeys('Laptop');
        await driver.findElement(By.css('input[aria-label="Category"]')).sendKeys('Electronics');
        await driver.findElement(By.css('input[aria-label="Brand"]')).sendKeys('BrandA');
        await driver.findElement(By.css('textarea[aria-label="Description"]')).sendKeys('High performance laptop');
        await driver.findElement(By.css('input[aria-label="Product Price"]')).sendKeys('1000');
        await driver.findElement(By.css('input[aria-label="Inventory Quantity"]')).sendKeys('5');
        // Image upload skipped for simplicity
        await driver.findElement(By.xpath("//button[contains(text(), 'Submit')]")).click();
        const successElem = await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Product has been added successfully')]")), 10000);
        assert.ok(await successElem.isDisplayed());
    });

    it('should delete a product', async () => {
        await loginAsAdmin();
        await driver.get(`${baseUrl}/admin/products`);
        const deleteBtns = await driver.findElements(By.css('[data-testid="deleteProductBtn"]'));
        assert.ok(deleteBtns.length > 0);
        await deleteBtns[0].click();
        await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Purchase Confirmation')]")), 5000);
        await driver.findElement(By.xpath("//button[contains(text(), 'Confirm')]")).click();
        // Optionally check for toast or removal
    });

    it('should change order status', async () => {
        await loginAsAdmin();
        await driver.get(`${baseUrl}/admin/orders`);
        const doneBtns = await driver.findElements(By.css('[data-testid="doneBtn"]'));
        assert.ok(doneBtns.length > 0);
        await doneBtns[0].click();
        await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Done')]")), 5000);
    });
});
