import { Module } from '@nestjs/common';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { StatisticsCacheService } from './statistics-cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [StatisticsController],
  providers: [StatisticsService, StatisticsCacheService, PrismaService],
  exports: [StatisticsService],
})
export class StatisticsModule {}

