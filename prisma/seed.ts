import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Créer un utilisateur admin par défaut
  const adminEmail = 'admin@almadina.com';
  const adminPassword = 'admin123'; // À changer en production !

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'Al Madina',
        role: 'ADMIN',
      },
    });

    console.log('✅ Utilisateur admin créé :');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Mot de passe: ${adminPassword}`);
    console.log('⚠️  IMPORTANT: Changez le mot de passe après la première connexion !');
  } else {
    console.log('ℹ️  Un utilisateur admin existe déjà avec cet email.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

