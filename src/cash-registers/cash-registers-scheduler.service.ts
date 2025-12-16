import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CashRegistersService } from './cash-registers.service';

@Injectable()
export class CashRegistersSchedulerService {
  private readonly logger = new Logger(CashRegistersSchedulerService.name);

  constructor(private readonly cashRegistersService: CashRegistersService) {}

  /**
   * Ferme automatiquement toutes les caisses ouvertes chaque jour à minuit
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleAutoCloseCashRegisters() {
    this.logger.log('Démarrage de la fermeture automatique des caisses...');
    try {
      const result = await this.cashRegistersService.autoCloseOpenCashRegisters();
      this.logger.log(`Fermeture automatique terminée: ${result.message}`);
    } catch (error) {
      this.logger.error('Erreur lors de la fermeture automatique des caisses:', error);
    }
  }
}
