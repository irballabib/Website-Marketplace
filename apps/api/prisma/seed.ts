import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { generateUuidV7 } from '../src/common/id';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { code: 'cutbray' },
    update: { name: 'Bale Store' },
    create: {
      id: generateUuidV7(),
      name: 'Bale Store',
      code: 'cutbray',
      settings: {},
      isActive: true,
    },
  });
  console.log('✅ Tenant created:', tenant.name);

  // Create permissions
  const permissions = [
    { code: 'pos.discount.approve', name: 'Approve POS Discount', category: 'POS' },
    { code: 'pos.shift.manage', name: 'Manage POS Shift', category: 'POS' },
    { code: 'pos.sale.create', name: 'Create POS Sale', category: 'POS' },
    { code: 'pos.sale.void', name: 'Void POS Sale', category: 'POS' },
    { code: 'accounting.journal.post', name: 'Post Journal Entry', category: 'Accounting' },
    { code: 'inventory.adjust', name: 'Adjust Inventory', category: 'Inventory' },
    { code: 'production.workorder.create', name: 'Create Work Order', category: 'Production' },
    { code: 'booking.policy.manage', name: 'Manage Booking Policy', category: 'Booking' },
    { code: 'catalog.product.manage', name: 'Manage Products', category: 'Catalog' },
    { code: 'order.view', name: 'View Orders', category: 'Order' },
    { code: 'order.manage', name: 'Manage Orders', category: 'Order' },
    { code: 'report.view', name: 'View Reports', category: 'Reporting' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }
  console.log('✅ Permissions created');

  // Create roles
  const superadminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'superadmin' } },
    update: {},
    create: {
      id: generateUuidV7(),
      tenantId: tenant.id,
      name: 'superadmin',
      description: 'Super Administrator - Full Access',
      isSystem: true,
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'admin' } },
    update: {},
    create: {
      id: generateUuidV7(),
      tenantId: tenant.id,
      name: 'admin',
      description: 'Administrator - Manage Operations',
      isSystem: true,
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'cashier' } },
    update: {},
    create: {
      id: generateUuidV7(),
      tenantId: tenant.id,
      name: 'cashier',
      description: 'Cashier - POS Operations',
      isSystem: true,
    },
  });

  const warehouseRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'warehouse' } },
    update: {},
    create: {
      id: generateUuidV7(),
      tenantId: tenant.id,
      name: 'warehouse',
      description: 'Warehouse Staff - Inventory Management',
      isSystem: true,
    },
  });

  const accountantRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'accountant' } },
    update: {},
    create: {
      id: generateUuidV7(),
      tenantId: tenant.id,
      name: 'accountant',
      description: 'Accountant - Financial Operations',
      isSystem: true,
    },
  });
  console.log('✅ Roles created');

  // Assign all permissions to superadmin
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId_tenantId: {
          roleId: superadminRole.id,
          permissionId: perm.id,
          tenantId: tenant.id,
        },
      },
      update: {},
      create: {
        roleId: superadminRole.id,
        permissionId: perm.id,
        tenantId: tenant.id,
      },
    });
  }

  // Assign relevant permissions to other roles
  const adminPerms = allPermissions.filter(p =>
    !['accounting.journal.post'].includes(p.code)
  );
  for (const perm of adminPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId_tenantId: {
          roleId: adminRole.id,
          permissionId: perm.id,
          tenantId: tenant.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
        tenantId: tenant.id,
      },
    });
  }

  const cashierPerms = allPermissions.filter(p =>
    ['pos.discount.approve', 'pos.shift.manage', 'pos.sale.create', 'pos.sale.void', 'order.view', 'order.manage', 'catalog.product.manage'].includes(p.code)
  );
  for (const perm of cashierPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId_tenantId: {
          roleId: cashierRole.id,
          permissionId: perm.id,
          tenantId: tenant.id,
        },
      },
      update: {},
      create: {
        roleId: cashierRole.id,
        permissionId: perm.id,
        tenantId: tenant.id,
      },
    });
  }

  const warehousePerms = allPermissions.filter(p =>
    ['inventory.adjust', 'catalog.product.manage'].includes(p.code)
  );
  for (const perm of warehousePerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId_tenantId: {
          roleId: warehouseRole.id,
          permissionId: perm.id,
          tenantId: tenant.id,
        },
      },
      update: {},
      create: {
        roleId: warehouseRole.id,
        permissionId: perm.id,
        tenantId: tenant.id,
      },
    });
  }

  const accountantPerms = allPermissions.filter(p =>
    ['accounting.journal.post', 'report.view'].includes(p.code)
  );
  for (const perm of accountantPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId_tenantId: {
          roleId: accountantRole.id,
          permissionId: perm.id,
          tenantId: tenant.id,
        },
      },
      update: {},
      create: {
        roleId: accountantRole.id,
        permissionId: perm.id,
        tenantId: tenant.id,
      },
    });
  }
  console.log('✅ Role permissions assigned');

  // Create default users
  const passwordHash = await argon2.hash('password123', {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const users = [
    { email: 'superadmin@cutbray.local', fullName: 'Super Admin', role: superadminRole },
    { email: 'admin@cutbray.local', fullName: 'Admin', role: adminRole },
    { email: 'kasir@cutbray.local', fullName: 'Kasir', role: cashierRole },
    { email: 'gudang@cutbray.local', fullName: 'Staf Gudang', role: warehouseRole },
    { email: 'akuntan@cutbray.local', fullName: 'Akuntan', role: accountantRole },
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: userData.email,
        },
      },
      update: {},
      create: {
        id: generateUuidV7(),
        tenantId: tenant.id,
        email: userData.email,
        passwordHash,
        fullName: userData.fullName,
        isActive: true,
        isVerified: true,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId_tenantId: {
          userId: user.id,
          roleId: userData.role.id,
          tenantId: tenant.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: userData.role.id,
        tenantId: tenant.id,
      },
    });
  }
  console.log('✅ Default users created (password: password123)');

  // Create default category
  const category = await prisma.category.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: 'celana-panjang',
      },
    },
    update: {},
    create: {
      id: generateUuidV7(),
      tenantId: tenant.id,
      name: 'Celana Panjang',
      slug: 'celana-panjang',
      isActive: true,
      sortOrder: 1,
    },
  });
  console.log('✅ Category created');

  // Create default product
  const product = await prisma.product.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: 'cutbray-classic',
      },
    },
    update: {},
    create: {
      id: generateUuidV7(),
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Cutbray Classic',
      slug: 'cutbray-classic',
      description: 'Celana cutbray klasik bahan denim premium',
      skuPrefix: 'CTB',
      isActive: true,
    },
  });
  console.log('✅ Product created');

  // Create variants (SKUs)
  const sizes = ['28', '30', '32', '34', '36', '38'];
  const colors = ['Hitam', 'Navy', 'Coklat', 'Abu-abu'];

  for (const color of colors) {
    for (const size of sizes) {
      const sku = `CTB-${size}-${color.toUpperCase().slice(0, 3)}`;
      await prisma.variant.upsert({
        where: { sku },
        update: {},
        create: {
          id: generateUuidV7(),
          tenantId: tenant.id,
          productId: product.id,
          sku,
          barcode: `899${sku.replace(/-/g, '').padEnd(10, '0')}`,
          color,
          size,
          price: 199000,
          costPrice: 95000,
          weight: 0.45,
          isActive: true,
        },
      });
    }
  }
  console.log('✅ Variants (SKUs) created');

  // Create default locations
  const locations = [
    { code: 'WH-01', name: 'Gudang Utama', type: 'WAREHOUSE' },
    { code: 'ST-01', name: 'Toko Pusat', type: 'STORE' },
    { code: 'BZ-01', name: 'Booth Bazar', type: 'BAZAAR' },
    { code: 'PR-01', name: 'Area Produksi', type: 'PRODUCTION' },
  ];

  for (const loc of locations) {
    await prisma.location.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: loc.code } },
      update: {},
      create: {
        id: generateUuidV7(),
        tenantId: tenant.id,
        ...loc,
        isActive: true,
      },
    });
  }
  console.log('✅ Locations created');

  // Create default Chart of Accounts (SAK EMKM simplified)
  const accounts = [
    // Aset
    { code: '1100', name: 'Kas', type: 'ASSET', isSystem: true },
    { code: '1110', name: 'Bank', type: 'ASSET', isSystem: true },
    { code: '1120', name: 'Piutang Usaha', type: 'ASSET', isSystem: true },
    { code: '1130', name: 'Persediaan Barang Jadi', type: 'ASSET', isSystem: true },
    { code: '1140', name: 'Persediaan Bahan Baku', type: 'ASSET', isSystem: true },
    { code: '1150', name: 'Barang Dalam Proses', type: 'ASSET', isSystem: true },
    { code: '1200', name: 'Peralatan', type: 'ASSET', isSystem: true },
    { code: '1210', name: 'Akumulasi Penyusutan Peralatan', type: 'ASSET', isSystem: true },

    // Liabilitas
    { code: '2100', name: 'Utang Usaha', type: 'LIABILITY', isSystem: true },
    { code: '2110', name: 'Uang Muka Pelanggan', type: 'LIABILITY', isSystem: true },
    { code: '2120', name: 'Utang Pajak', type: 'LIABILITY', isSystem: true },

    // Ekuitas
    { code: '3100', name: 'Modal Disetor', type: 'EQUITY', isSystem: true },
    { code: '3200', name: 'Saldo Laba', type: 'EQUITY', isSystem: true },

    // Pendapatan
    { code: '4100', name: 'Penjualan', type: 'REVENUE', isSystem: true },
    { code: '4110', name: 'Potongan Penjualan', type: 'REVENUE', isSystem: true },
    { code: '4120', name: 'Retur Penjualan', type: 'REVENUE', isSystem: true },

    // HPP
    { code: '5100', name: 'HPP Penjualan', type: 'COGS', isSystem: true },

    // Beban
    { code: '6100', name: 'Beban Gaji', type: 'EXPENSE', isSystem: true },
    { code: '6200', name: 'Beban Sewa', type: 'EXPENSE', isSystem: true },
    { code: '6300', name: 'Beban Listrik & Air', type: 'EXPENSE', isSystem: true },
    { code: '6400', name: 'Beban Admin Penjualan', type: 'EXPENSE', isSystem: true },
    { code: '6500', name: 'Beban Admin Pembayaran', type: 'EXPENSE', isSystem: true },
    { code: '6600', name: 'Beban Penyusutan', type: 'EXPENSE', isSystem: true },
  ];

  for (const acc of accounts) {
    await prisma.account.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: acc.code } },
      update: {},
      create: {
        id: generateUuidV7(),
        tenantId: tenant.id,
        ...acc,
        isActive: true,
      },
    });
  }
  console.log('✅ Chart of Accounts created');

  // Create default settings
  const settings = [
    { key: 'company_name', value: 'Bale Store', scope: 'global' },
    { key: 'currency', value: 'IDR', scope: 'global' },
    { key: 'timezone', value: 'Asia/Jakarta', scope: 'global' },
    { key: 'stock_valuation_method', value: 'MOVING_AVERAGE', scope: 'inventory' },
    { key: 'reservation_minutes', value: 15, scope: 'inventory' },
    { key: 'default_dp_percent', value: 30, scope: 'booking' },
    { key: 'dp_deadline_minutes', value: 1440, scope: 'booking' },
    { key: 'pos_discount_limit', value: 10, scope: 'pos' },
    { key: 'fiscal_year_start', value: '01-01', scope: 'accounting' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { tenantId_scope_key: { tenantId: tenant.id, scope: setting.scope, key: setting.key } },
      update: { value: setting.value },
      create: {
        id: generateUuidV7(),
        tenantId: tenant.id,
        ...setting,
      },
    });
  }
  console.log('✅ Default settings created');

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });