import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

test('completes the invited participant flow through an idempotent reserved playlist', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Chào mừng bạn đến với nghiên cứu' })).toBeVisible();
  await expect(page.getByText('DEMO MODE')).toBeVisible();
  await page.getByRole('button', { name: /Đọc thông tin đồng thuận/ }).click();

  const accept = page.getByRole('button', { name: 'Đồng ý và tiếp tục' });
  await expect(accept).toBeDisabled();
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByLabel(/Họ tên xác nhận/).fill('Nguyễn Minh Anh');
  await expect(accept).toBeEnabled();
  await accept.click();

  await expect(page.getByRole('heading', { name: 'Một vài thông tin về bạn' })).toBeVisible();
  await page.getByLabel(/^Tuổi/).fill('21');
  await page.getByLabel(/Trình độ học vấn/).selectOption('undergraduate');
  await page.getByLabel(/Mức độ quen thuộc/).selectOption('3');
  await page.getByRole('button', { name: 'Lưu và phân bổ playlist' }).click();

  await expect(page.getByRole('heading', { name: 'Sẵn sàng nhận tổ hợp bài giảng' })).toBeVisible();
  await expect(page.getByText('Development selector')).toBeVisible();
  await page.getByRole('button', { name: 'Nhận playlist của tôi' }).click();

  await expect(page.getByRole('heading', { name: 'Playlist của bạn đã được giữ chỗ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Foundations of Human–Computer Interaction' })).toBeVisible();
  await expect(page.getByText('Introduction to HCI')).toBeVisible();
  await expect(page.getByText('Evaluating Interactive Systems')).toBeVisible();

  const countdownBeforeReload = await page.locator('[aria-live="polite"]').first().textContent();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Playlist của bạn đã được giữ chỗ' })).toBeVisible();
  const countdownAfterReload = await page.locator('[aria-live="polite"]').first().textContent();
  expect(countdownBeforeReload).toMatch(/^\d{2}:\d{2}$/);
  expect(countdownAfterReload).toMatch(/^\d{2}:\d{2}$/);
  expect(Number(countdownAfterReload?.replace(':', ''))).toBeLessThanOrEqual(
    Number(countdownBeforeReload?.replace(':', '')),
  );
});

test('gates preparation until a source is ready and keeps ZIP available on a healthy connection', async ({ page }) => {
  await page.goto('/');

  // The first test creates the server-side demo participant. If a fresh browser-only
  // fallback is active, prepare the same state through the UI.
  if (await page.getByRole('heading', { name: 'Chào mừng bạn đến với nghiên cứu' }).isVisible()) {
    await page.getByRole('button', { name: /Đọc thông tin đồng thuận/ }).click();
    for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
    await page.getByLabel(/Họ tên xác nhận/).fill('Nguyễn Minh Anh');
    await page.getByRole('button', { name: 'Đồng ý và tiếp tục' }).click();
    await page.getByLabel(/^Tuổi/).fill('21');
    await page.getByLabel(/Trình độ học vấn/).selectOption('undergraduate');
    await page.getByLabel(/Mức độ quen thuộc/).selectOption('3');
    await page.getByRole('button', { name: 'Lưu và phân bổ playlist' }).click();
    await page.getByRole('button', { name: 'Nhận playlist của tôi' }).click();
  }

  const continueLink = page.getByRole('link', { name: /Tiếp tục đến màn hình study/ });
  await expect(continueLink).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: /Streaming từ cloud/ }).click();
  await page.route('**/flower.mp4', async (route) => {
    await route.fulfill({
      status: 206,
      contentType: 'video/mp4',
      headers: { 'content-range': 'bytes 0-1048575/1048576' },
      body: Buffer.alloc(1_048_576),
    });
  });
  await page.getByRole('button', { name: 'Kiểm tra khả năng streaming' }).click();
  await expect(page.getByText(/Streaming sẵn sàng/)).toBeVisible();
  await expect(continueLink).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Phát âm thử' }).click();
  await page.getByLabel('Tôi nghe rõ âm thử ở mức âm lượng phù hợp.').check();
  await expect(continueLink).toHaveAttribute('aria-disabled', 'false');

  await page.getByRole('button', { name: /Phát từ gói ZIP/ }).click();
  await expect(page.getByRole('button', { name: 'Import và xác minh ZIP' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải package ZIP' })).toBeVisible();
  await expect(page.getByText('Có thể dùng ngay cả khi mạng tốt')).toBeVisible();
  await expect(continueLink).toHaveAttribute('aria-disabled', 'true');
});
