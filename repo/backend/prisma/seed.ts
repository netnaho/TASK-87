import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function hashPassword(password: string, salt: string): Promise<string> {
  return bcrypt.hash(password + salt, 12);
}

async function main() {
  console.log('Seeding database...');

  // Clean up ephemeral test data on each startup for idempotent test runs
  await prisma.rateLimitLog.deleteMany({});
  console.log('Cleared rate limit logs');

  // Create demo users for every role
  const demoUsers = [
    { username: 'admin', password: 'admin123!', displayName: 'System Admin', role: Role.ADMIN },
    { username: 'manager', password: 'manager123!', displayName: 'Harbor Manager', role: Role.MANAGER },
    { username: 'clerk', password: 'clerk123!', displayName: 'Inventory Clerk', role: Role.INVENTORY_CLERK },
    { username: 'frontdesk', password: 'frontdesk123!', displayName: 'Front Desk Agent', role: Role.FRONT_DESK },
    { username: 'host', password: 'host123!', displayName: 'Property Host', role: Role.HOST },
    { username: 'guest', password: 'guest123!', displayName: 'Test Guest', role: Role.GUEST },
    { username: 'moderator', password: 'moderator123!', displayName: 'Content Moderator', role: Role.MODERATOR },
  ];

  for (const u of demoUsers) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (!existing) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = await hashPassword(u.password, salt);
      const user = await prisma.user.create({
        data: {
          username: u.username,
          passwordHash,
          salt,
          displayName: u.displayName,
          role: u.role,
        },
      });
      await prisma.trustScore.create({
        data: { userId: user.id, score: 50.0 },
      });
      console.log(`Created user: ${u.username} (${u.role})`);
    } else {
      console.log(`User ${u.username} already exists, skipping`);
    }
  }

  // Create demo locations
  const locations = [
    { name: 'Downtown Warehouse', address: '100 Harbor Blvd, Suite A' },
    { name: 'Bayfront Property', address: '250 Bayfront Drive' },
    { name: 'Marina Supply Depot', address: '75 Marina Way' },
  ];

  for (const loc of locations) {
    const existing = await prisma.location.findUnique({ where: { name: loc.name } });
    if (!existing) {
      await prisma.location.create({ data: loc });
      console.log(`Created location: ${loc.name}`);
    }
  }

  // Create demo items
  const items = [
    { name: 'Door Lock Battery Pack', sku: 'MNT-BAT-001', category: 'Maintenance', description: '4-pack AA batteries for electronic door locks', isLotControlled: false, unitOfMeasure: 'PK', unitPrice: 4.99 },
    { name: 'Bath Towels - White', sku: 'LIN-TWL-001', category: 'Linens', description: 'Standard white bath towels, 27x54 inches', isLotControlled: false, unitOfMeasure: 'EA', unitPrice: 8.50 },
    { name: 'Shampoo Bottles', sku: 'AMN-SHP-001', category: 'Amenities', description: 'Travel-size shampoo 50ml bottles', isLotControlled: true, unitOfMeasure: 'EA', unitPrice: 1.25 },
    { name: 'Pillow Cases - Queen', sku: 'LIN-PIL-001', category: 'Linens', description: 'Queen size pillow cases, 20x30 inches', isLotControlled: true, unitOfMeasure: 'EA', unitPrice: 3.75 },
    { name: 'Hand Soap Dispenser Refill', sku: 'AMN-SOP-001', category: 'Amenities', description: 'Hand soap 500ml refill packs', isLotControlled: true, unitOfMeasure: 'EA', unitPrice: 2.50 },
    { name: 'Light Bulbs LED', sku: 'MNT-LED-001', category: 'Maintenance', description: '60W equivalent LED bulbs, soft white', isLotControlled: false, unitOfMeasure: 'EA', unitPrice: 3.25 },
    { name: 'Bed Sheets - King', sku: 'LIN-SHT-001', category: 'Linens', description: 'King size flat sheets, 300 thread count', isLotControlled: true, unitOfMeasure: 'EA', unitPrice: 15.00 },
    { name: 'Coffee Pods - Assorted', sku: 'AMN-COF-001', category: 'Amenities', description: 'Assorted coffee pods, box of 24', isLotControlled: true, unitOfMeasure: 'BX', unitPrice: 12.99 },
  ];

  for (const item of items) {
    const existing = await prisma.item.findUnique({ where: { sku: item.sku } });
    if (!existing) {
      await prisma.item.create({ data: item });
      console.log(`Created item: ${item.name}`);
    }
  }

  // Create demo vendors
  const vendors = [
    { name: 'Harbor Linen Supply Co.' },
    { name: 'Pacific Amenities Inc.' },
    { name: 'Coastal Maintenance Parts' },
  ];

  for (const v of vendors) {
    const existing = await prisma.vendor.findUnique({ where: { name: v.name } });
    if (!existing) {
      await prisma.vendor.create({ data: v });
      console.log(`Created vendor: ${v.name}`);
    }
  }

  // Seed sensitive words
  const sensitiveWords = [
    { word: 'spam', category: 'spam' },
    { word: 'scam', category: 'fraud' },
    { word: 'fake', category: 'fraud' },
    { word: 'harassment', category: 'abuse' },
    { word: 'threat', category: 'abuse' },
    { word: 'illegal', category: 'legal' },
    { word: 'counterfeit', category: 'fraud' },
  ];

  for (const sw of sensitiveWords) {
    const existing = await prisma.sensitiveWord.findUnique({ where: { word: sw.word } });
    if (!existing) {
      await prisma.sensitiveWord.create({ data: sw });
      console.log(`Created sensitive word: ${sw.word}`);
    }
  }

  // Seed tags for reviews
  const tags = [
    { name: 'Spotless', category: 'Cleanliness' },
    { name: 'Needs Improvement', category: 'Cleanliness' },
    { name: 'Responsive Host', category: 'Communication' },
    { name: 'Slow Response', category: 'Communication' },
    { name: 'As Described', category: 'Accuracy' },
    { name: 'Misleading', category: 'Accuracy' },
    { name: 'Great Value', category: 'General' },
    { name: 'Would Recommend', category: 'General' },
    { name: 'Family Friendly', category: 'General' },
    { name: 'Pet Friendly', category: 'General' },
  ];

  for (const tag of tags) {
    const existing = await prisma.tag.findUnique({ where: { name: tag.name } });
    if (!existing) {
      await prisma.tag.create({ data: tag });
      console.log(`Created tag: ${tag.name}`);
    }
  }

  // Seed stock levels for demo items at demo locations
  const allItems = await prisma.item.findMany();
  const allLocations = await prisma.location.findMany();

  for (const item of allItems) {
    for (const location of allLocations) {
      const existing = await prisma.stockLevel.findFirst({
        where: { itemId: item.id, locationId: location.id, lotId: null },
      });
      if (!existing) {
        const onHand = Math.floor(Math.random() * 80) + 5;
        await prisma.stockLevel.create({
          data: {
            itemId: item.id,
            locationId: location.id,
            onHand,
            safetyThreshold: 10,
            avgDailyUsage: parseFloat((Math.random() * 3 + 0.5).toFixed(2)),
          },
        });
      }
    }
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
