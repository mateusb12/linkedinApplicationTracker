from selenium import webdriver

from source.core_scrapper.selenium_utils import open_chrome, export_cookies


class CoreScrapper:
    def __init__(self, driver: webdriver.Chrome = None, ):
        self.driver = driver if driver else open_chrome()

    def save_cookies(self):
        export_cookies(self.driver)