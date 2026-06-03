const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, started_at FROM _prisma_migrations 
    ORDER BY started_at DESC LIMIT 10
  `;
  console.log('Applied migrations:');
  migrations.forEach(m => {
    console.log(`  - ${m.migration_name} (${m.started_at})`);
  });
}

main()
  .catch(e => console.error('Error:', e.message))
  .finally(() => prisma.$disconnect());
