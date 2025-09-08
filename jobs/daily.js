const { parentPort } = require('worker_threads');
const { checkAllUrls } = require('../services/downloader.js');

(async () => {
  const now = new Date();
  const day = now.getDay(); // 0:日, 1:月, ..., 6:土

  if (day >= 1 && day <= 5) {
    console.log(`[${now.toISOString()}]　Operate checkAllUrls`);
    try {
      await checkAllUrls();
      console.log('✅ checkAllUrls Completed');
    } catch (err) {
      console.error('❌ Error:', err);
    }
  }

  parentPort.close();
})();
