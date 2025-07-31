import unittest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

class AdminUITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = Options()
        options.add_argument('--headless')
        cls.driver = webdriver.Chrome(options=options)
        cls.driver.implicitly_wait(10)
        cls.base_url = "http://localhost:3000"  # Change if your dev server runs elsewhere

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def login_as_admin(self):
        self.driver.get(f"{self.base_url}/login")
        self.driver.find_element(By.PLACEHOLDER, "email").send_keys("user2@example.com")
        self.driver.find_element(By.PLACEHOLDER, "password").send_keys("password2")
        self.driver.find_element(By.XPATH, "//button[contains(text(), 'Login')]").click()
        # Wait for dashboard
        WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Admin Dashboard')]")
        ))

    def test_dashboard_loads(self):
        self.login_as_admin()
        self.driver.get(f"{self.base_url}/admin")
        self.assertTrue(
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Sales Over Time')]")
            ))
        )

    def test_product_list_and_search(self):
        self.login_as_admin()
        self.driver.get(f"{self.base_url}/admin/products")
        self.assertTrue(self.driver.find_element(By.XPATH, "//*[contains(text(), 'Electronics')]").is_displayed())
        search_input = self.driver.find_element(By.PLACEHOLDER, "Search product")
        search_input.clear()
        search_input.send_keys("Electronics")
        search_input.send_keys(Keys.RETURN)
        WebDriverWait(self.driver, 5).until(
            EC.invisibility_of_element_located((By.XPATH, "//*[contains(text(), 'Fashion')]")
        ))
        self.assertTrue(self.driver.find_element(By.XPATH, "//*[contains(text(), 'Electronics')]").is_displayed())

    def test_add_product(self):
        self.login_as_admin()
        self.driver.get(f"{self.base_url}/admin/add")
        self.driver.find_element(By.LABEL, "Product name").send_keys("Laptop")
        self.driver.find_element(By.LABEL, "Category").send_keys("Electronics")
        self.driver.find_element(By.LABEL, "Brand").send_keys("BrandA")
        self.driver.find_element(By.LABEL, "Description").send_keys("High performance laptop")
        self.driver.find_element(By.LABEL, "Product Price").send_keys("1000")
        self.driver.find_element(By.LABEL, "Inventory Quantity").send_keys("5")
        # Image upload skipped for simplicity
        self.driver.find_element(By.XPATH, "//button[contains(text(), 'Submit')]").click()
        self.assertTrue(WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Product has been added successfully')]")
        )))

    def test_delete_product(self):
        self.login_as_admin()
        self.driver.get(f"{self.base_url}/admin/products")
        delete_btn = self.driver.find_elements(By.XPATH, "//*[@data-testid='deleteProductBtn']")[0]
        delete_btn.click()
        WebDriverWait(self.driver, 5).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Purchase Confirmation')]")
        ))
        self.driver.find_element(By.XPATH, "//button[contains(text(), 'Confirm')]").click()
        # You may want to check for a toast or removal from the list

    def test_order_status_change(self):
        self.login_as_admin()
        self.driver.get(f"{self.base_url}/admin/orders")
        done_btn = self.driver.find_elements(By.XPATH, "//*[@data-testid='doneBtn']")[0]
        done_btn.click()
        # Wait for status update
        WebDriverWait(self.driver, 5).until(
            EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Done')]")
        ))

if __name__ == "__main__":
    unittest.main()
