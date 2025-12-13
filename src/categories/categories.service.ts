import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    // Vérifier si une catégorie avec le même nom existe déjà
    const existing = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });

    if (existing) {
      throw new ConflictException('Une catégorie avec ce nom existe déjà');
    }

    return this.prisma.category.create({
      data: createCategoryDto,
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findAllWithFirstProduct() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    // Pour chaque catégorie, récupérer le premier produit actif avec son image principale
    const categoriesWithProduct = await Promise.all(
      categories.map(async (category) => {
        const firstProduct = await this.prisma.product.findFirst({
          where: {
            categoryId: category.id,
            isActive: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        let firstProductImage: string | null = null;

        if (firstProduct) {
          // Récupérer l'image principale du produit
          const mainImage = await (this.prisma as any).productImage.findFirst({
            where: {
              productId: firstProduct.id,
              isMain: true,
            },
          });

          if (!mainImage) {
            // Si pas d'image principale, prendre la première image
            const firstImage = await (this.prisma as any).productImage.findFirst({
              where: {
                productId: firstProduct.id,
              },
            });
            firstProductImage = firstImage?.url || null;
          } else {
            firstProductImage = mainImage.url;
          }
        }

        return {
          ...category,
          firstProductImage,
        };
      }),
    );

    return categoriesWithProduct;
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Catégorie avec l'ID ${id} introuvable`);
    }

    return category;
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    // Vérifier si la catégorie existe
    const existing = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Catégorie avec l'ID ${id} introuvable`);
    }

    // Si le nom est modifié, vérifier qu'il n'existe pas déjà
    if (updateCategoryDto.name && updateCategoryDto.name !== existing.name) {
      const nameExists = await this.prisma.category.findUnique({
        where: { name: updateCategoryDto.name },
      });

      if (nameExists) {
        throw new ConflictException('Une catégorie avec ce nom existe déjà');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
  }

  async remove(id: number) {
    // Vérifier si la catégorie existe
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: {
        products: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Catégorie avec l'ID ${id} introuvable`);
    }

    // Vérifier si la catégorie a des produits associés
    if (existing.products.length > 0) {
      throw new ConflictException(
        'Impossible de supprimer cette catégorie car elle contient des produits',
      );
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }
}

