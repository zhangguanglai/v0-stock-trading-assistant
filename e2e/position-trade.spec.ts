import { test, expect } from '@playwright/test';

test.describe('持仓管理问题修复验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('onboarding_completed', 'true');
    });
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('Issue 1: Sell dialog should auto-use position data', async ({ page }) => {
    // Navigate to 持仓管理
    await page.click('text=持仓管理');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/t1-position-view.png', fullPage: true });

    // Click the first position card's "卖出一半" button
    const sellHalfBtn = page.locator('button').filter({ hasText: '卖出一半' }).first();
    const visible = await sellHalfBtn.isVisible();
    console.log('Sell half button visible:', visible);

    if (!visible) {
      // Try clicking the card's "卖出" from the "..." dropdown menu
      const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).nth(0);
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        await page.waitForTimeout(500);
        await page.click('text=卖出');
        await page.waitForTimeout(2000);
      } else {
        console.log('No sell button found');
        return;
      }
    } else {
      await sellHalfBtn.click();
      await page.waitForTimeout(2000);
    }

    // Wait for dialog
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/t1-sell-dialog.png', fullPage: true });

    // Get dialog text
    const dialogs = page.locator('[role="dialog"]');
    const dialogCount = await dialogs.count();
    console.log('Dialog count:', dialogCount);

    if (dialogCount > 0) {
      const dialogText = await dialogs.first().textContent();
      console.log('Dialog text:', dialogText);

      // Check if "请选择股票" appears
      expect(dialogText).not.toContain('请选择股票以检查卖出策略');
      console.log('PASS: Dialog does not show "请选择股票"');

      // Check if strategy check has position data
      const hasPriceData = dialogText?.includes('成本') || dialogText?.includes('现价') || dialogText?.includes('持仓');
      console.log('Has price data in sell strategy:', hasPriceData);
      expect(hasPriceData).toBeTruthy();
    }
  });

  test('Issue 2: Buy strategy check should show position data fallback', async ({ page }) => {
    await page.click('text=持仓管理');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/t2-position-view.png', fullPage: true });

    // Click "录入交易" button
    const addTradeBtn = page.locator('button').filter({ hasText: '录入交易' });
    if (!await addTradeBtn.isVisible()) {
      console.log('No add trade button found');
      return;
    }
    await addTradeBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/t2-buy-dialog-full.png', fullPage: true });

    // Find buy dialog
    const dialogs = page.locator('[role="dialog"]');
    if (await dialogs.count() === 0) {
      console.log('No dialog found');
      return;
    }

    const dialogText = await dialogs.first().textContent();
    console.log('Buy dialog text:', dialogText);

    // Check strategy check area
    const hasGenericError = dialogText?.includes('无法获取股票数据，请稍后重试');
    console.log('Has generic error:', hasGenericError);

    if (hasGenericError) {
      // Should have position-based fallback data
      const hasFallback = dialogText?.includes('现价¥') || dialogText?.includes('成本¥') || dialogText?.includes('无数据');
      console.log('Has fallback info:', hasFallback);
      expect(hasFallback).toBeTruthy();
    }

    // Scroll to see bottom of dialog
    await page.locator('[role="dialog"]').evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/t2-buy-dialog-bottom.png' });
  });

  test('Issue 3: Funds total should show source label', async ({ page }) => {
    await page.click('text=持仓管理');
    await page.waitForTimeout(2000);

    // Click "录入交易"
    const addTradeBtn = page.locator('button').filter({ hasText: '录入交易' });
    if (!await addTradeBtn.isVisible()) {
      console.log('No add trade button');
      return;
    }
    await addTradeBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/t3-buy-dialog.png', fullPage: true });

    const dialogs = page.locator('[role="dialog"]');
    if (await dialogs.count() === 0) {
      console.log('No dialog found');
      return;
    }

    const dialogText = await dialogs.first().textContent();
    console.log('Dialog text for funds:', dialogText);

    // Verify source label is present
    const hasSourceLabel = dialogText?.includes('策略配置') || dialogText?.includes('默认值');
    console.log('Has source label:', hasSourceLabel);
    expect(hasSourceLabel).toBeTruthy();
  });
});
