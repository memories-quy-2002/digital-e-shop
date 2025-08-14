from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

# --- Configuration ---
BASE_URL = "http://localhost:5173/admin"  # Change to your actual Admin Dashboard URL

# --- Setup ---


service = Service(ChromeDriverManager().install())
driver = webdriver.Chrome(service=service)
wait = WebDriverWait(driver, 10)

def test_google_search(driver: webdriver.Chrome):
    driver.get("https://www.google.com")
    assert "Google" in driver.title
    print("Google search page loaded successfully.")

def test_admin_dashboard(driver: webdriver.Chrome):
    driver.get(BASE_URL)
    print("✅ Admin Dashboard page loaded successfully.")

    wait.until(EC.presence_of_element_located(
        (By.XPATH, "//*[contains(text(),'📊 Admin Dashboard Overview')]")
    ))
    print("✅ Admin Dashboard loaded successfully.")

    wait.until(EC.presence_of_element_located(
        (By.XPATH, "//*[contains(text(),'Summary (This Month)')]")
    ))
    print("✅ Summary section visible.")

    wait.until(EC.presence_of_element_located(
        (By.XPATH, "//*[contains(text(),'Sales Over Time')]")
    ))
    print("✅ Sales Over Time chart visible.")

    wait.until(EC.presence_of_element_located(
        (By.XPATH, "//*[contains(text(),'Revenue Over Time')]")
    ))
    print("✅ Revenue Over Time chart visible.")

    download_button = wait.until(EC.element_to_be_clickable(
        (By.XPATH, "//button[contains(text(),'Download Detailed Report')]")
    ))
    download_button.click()
    print("✅ Download Detailed Report button clicked.")

    wait.until(EC.presence_of_element_located(
        (By.XPATH, "//*[contains(text(),'Top 10 Best-Selling Products')]")
    ))
    print("✅ Top 10 Best-Selling Products table visible.")

try:
    test_google_search(driver)
    test_admin_dashboard(driver)

except Exception as e:
    print("❌ Test failed:", e)

finally:
    driver.quit()
