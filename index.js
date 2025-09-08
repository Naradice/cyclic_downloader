const Bree = require('bree');

const bree = new Bree({
  jobs: [
    {
      name: 'check-all-urls',
      path: './jobs/daily.js',
      cron: '0 20 * * 1-5',
    }
  ]
});

bree.start();
