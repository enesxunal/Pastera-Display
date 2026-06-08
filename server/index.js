const createApp = require('./app');
const { initDatabase } = require('./db');
const { seedAdmin } = require('./db/seed');
const config = require('./config');

/**
 * Yerel geliştirme sunucusunu başlat
 */
async function start() {
  await initDatabase();
  await seedAdmin(config.adminUsername, config.adminPassword);

  const app = createApp();

  app.listen(config.port, () => {
    console.log('');
    console.log('  🍝 Pastera Digital Signage');
    console.log('  ─────────────────────────────');
    console.log(`  Admin Panel : http://localhost:${config.port}/admin`);
    console.log(`  Ekran 1     : http://localhost:${config.port}/screen/1`);
    console.log(`  Ekran 2     : http://localhost:${config.port}/screen/2`);
    console.log(`  Ekran 3     : http://localhost:${config.port}/screen/3`);
    console.log(`  Birleşik    : http://localhost:${config.port}/screen/unified`);
    console.log(`  Giriş       : ${config.adminUsername} / ${config.adminPassword}`);
    console.log('');
  });
}

start().catch((err) => {
  console.error('Sunucu başlatılamadı:', err);
  process.exit(1);
});
