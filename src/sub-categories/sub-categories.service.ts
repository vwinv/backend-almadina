import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';

@Injectable()
export class SubCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSubCategoryDto: CreateSubCategoryDto) {
    // Vérifier que la catégorie parente existe
    const category = await this.prisma.category.findUnique({
      where: { id: createSubCategoryDto.categoryId },
    });

    if (!category) {
      throw new NotFoundException(
        `Catégorie avec l'ID ${createSubCategoryDto.categoryId} introuvable`,
      );
    }

    // Vérifier si une sous-catégorie avec le même nom existe déjà dans cette catégorie
    const existing = await this.prisma.subCategory.findUnique({
      where: {
        categoryId_name: {
          categoryId: createSubCategoryDto.categoryId,
          name: createSubCategoryDto.name,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Une sous-catégorie avec ce nom existe déjà dans cette catégorie',
      );
    }

    return this.prisma.subCategory.create({
      data: createSubCategoryDto,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findAll(categoryId?: number) {
    const where = categoryId ? { categoryId } : {};
    return this.prisma.subCategory.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const subCategory = await this.prisma.subCategory.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        products: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!subCategory) {
      throw new NotFoundException(`Sous-catégorie avec l'ID ${id} introuvable`);
    }

    return subCategory;
  }

  async update(id: number, updateSubCategoryDto: UpdateSubCategoryDto) {
    // Vérifier si la sous-catégorie existe
    const existing = await this.prisma.subCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Sous-catégorie avec l'ID ${id} introuvable`);
    }

    // Si le nom ou la catégorie est modifié, vérifier qu'il n'existe pas déjà
    if (updateSubCategoryDto.name || updateSubCategoryDto.categoryId) {
      const categoryId = updateSubCategoryDto.categoryId ?? existing.categoryId;
      const name = updateSubCategoryDto.name ?? existing.name;

      const nameExists = await this.prisma.subCategory.findUnique({
        where: {
          categoryId_name: {
            categoryId,
            name,
          },
        },
      });

      if (nameExists && nameExists.id !== id) {
        throw new ConflictException(
          'Une sous-catégorie avec ce nom existe déjà dans cette catégorie',
        );
      }
    }

    // Si la catégorie est modifiée, vérifier qu'elle existe
    if (updateSubCategoryDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateSubCategoryDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(
          `Catégorie avec l'ID ${updateSubCategoryDto.categoryId} introuvable`,
        );
      }
    }

    return this.prisma.subCategory.update({
      where: { id },
      data: updateSubCategoryDto,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    // Vérifier si la sous-catégorie existe
    const existing = await this.prisma.subCategory.findUnique({
      where: { id },
      include: {
        products: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Sous-catégorie avec l'ID ${id} introuvable`);
    }

    // Vérifier si la sous-catégorie a des produits associés
    if (existing.products.length > 0) {
      throw new ConflictException(
        'Impossible de supprimer cette sous-catégorie car elle contient des produits',
      );
    }

    return this.prisma.subCategory.delete({
      where: { id },
    });
  }
}

