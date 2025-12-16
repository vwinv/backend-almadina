import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function closeCashRegisterForUser(userId: number) {
  try {
    console.log(`Recherche de la caisse ouverte pour l'utilisateur ID ${userId}...`);

    // Trouver la caisse ouverte pour cet utilisateur
    const cashRegister = await (prisma as any).cashRegister.findFirst({
      where: {
        userId: userId,
        status: 'OPEN',
      },
      include: {
        transactions: true,
      },
    });

    if (!cashRegister) {
      console.log(`Aucune caisse ouverte trouvée pour l'utilisateur ID ${userId}`);
      return;
    }

    console.log(`Caisse trouvée: ID ${cashRegister.id}, Date: ${cashRegister.date}`);

    // Calculer le solde attendu
    let expectedBalance = new Decimal(cashRegister.openingBalance || 0);
    
    if (cashRegister.transactions) {
      for (const transaction of cashRegister.transactions) {
        // Ignorer les transactions d'ouverture, de fermeture et de réconciliation
        if (
          transaction.type !== 'OPENING' &&
          transaction.type !== 'CLOSING' &&
          transaction.type !== 'RECONCILIATION'
        ) {
          expectedBalance = expectedBalance.plus(transaction.amount);
        }
      }
    }

    console.log(`Solde attendu calculé: ${expectedBalance.toString()}`);

    // Utiliser le solde attendu comme solde réel et solde de fermeture
    const actualBalance = expectedBalance;
    const closingBalance = expectedBalance;
    const difference = new Decimal(0);

    // Fermer la caisse
    const updatedCashRegister = await (prisma as any).cashRegister.update({
      where: { id: cashRegister.id },
      data: {
        closeTime: new Date(),
        status: 'CLOSED',
        closingBalance,
        expectedBalance,
        actualBalance,
        difference,
        transactions: {
          create: {
            type: 'CLOSING',
            amount: closingBalance,
            description: `Fermeture automatique - Solde attendu: ${expectedBalance}`,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    console.log(`✅ Caisse ${cashRegister.id} fermée avec succès pour ${updatedCashRegister.user.firstName} ${updatedCashRegister.user.lastName}`);
    console.log(`   Solde de fermeture: ${closingBalance.toString()}`);
  } catch (error) {
    console.error('❌ Erreur lors de la fermeture de la caisse:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuter le script
const userId = 3;
closeCashRegisterForUser(userId)
  .then(() => {
    console.log('Script terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erreur:', error);
    process.exit(1);
  });
