import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = '/home/araujgom/Documents/repos/cariockko/docs/screenshots';

async function takeScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // Screenshot 1: Home page (level selection)
    console.log('Taking screenshot of home page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/01-home-level-selection.png`,
      fullPage: true,
    });
    console.log('✓ Home page screenshot saved');

    // Screenshot 2: Lessons list page (beginner level)
    console.log('Taking screenshot of lessons list...');
    await page.goto(`${BASE_URL}/lessons/beginner`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/02-lessons-list.png`,
      fullPage: true,
    });
    console.log('✓ Lessons list screenshot saved');

    // Screenshot 3: Lesson player page
    console.log('Taking screenshot of lesson player...');
    // First get a lesson ID
    const response = await page.goto(`${BASE_URL}/lessons/beginner`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Click on the first lesson
    const firstLessonLink = await page.$('a[href*="/lesson/"]');
    if (firstLessonLink) {
      await firstLessonLink.click();
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/03-lesson-player.png`,
        fullPage: true,
      });
      console.log('✓ Lesson player screenshot saved');
    } else {
      console.log('⚠ Could not find lesson link, taking screenshot of current page');
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/03-lesson-player.png`,
        fullPage: true,
      });
    }

    console.log('\n✅ All screenshots captured successfully!');
  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots();
