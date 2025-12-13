import { Module } from '@nestjs/common';
import { SubCategoriesController } from './sub-categories.controller';
import { SubCategoriesService } from './sub-categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SubCategoriesController],
  providers: [SubCategoriesService, PrismaService],
  exports: [SubCategoriesService],
})
export class SubCategoriesModule {}

