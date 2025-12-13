import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    const { images: imageUrls, videos: videoUrls, categoryId, subCategoryId, ...restData } = createProductDto;

    // Normaliser les valeurs : convertir 0, null, undefined en undefined
    const normalizedCategoryId = categoryId && categoryId > 0 ? categoryId : undefined;
    const normalizedSubCategoryId = subCategoryId && subCategoryId > 0 ? subCategoryId : undefined;

    // Validation : le produit doit avoir au moins une catégorie
    if (!normalizedCategoryId) {
      throw new Error('Le produit doit avoir une catégorie');
    }

    // Si une sous-catégorie est fournie, vérifier qu'elle appartient à la catégorie sélectionnée
    if (normalizedSubCategoryId) {
      const subCategory = await this.prisma.subCategory.findUnique({
        where: { id: normalizedSubCategoryId },
        include: { category: true },
      });

      if (!subCategory) {
        throw new Error(`Sous-catégorie avec l'ID ${normalizedSubCategoryId} introuvable`);
      }

      if (subCategory.categoryId !== normalizedCategoryId) {
        throw new Error('La sous-catégorie sélectionnée n\'appartient pas à la catégorie choisie');
      }
    }

    // Préparer les données avec les relations Prisma
    const data: any = {
      ...restData,
    };

    // Le produit peut avoir une catégorie et optionnellement une sous-catégorie
    data.category = { connect: { id: normalizedCategoryId } };
    
    if (normalizedSubCategoryId) {
      data.subCategory = { connect: { id: normalizedSubCategoryId } };
    }
    // Si aucune sous-catégorie n'est fournie, ne pas inclure le champ subCategory
    // (pas besoin de disconnect lors de la création, Prisma ne créera pas de relation)

    // Créer le produit d'abord
    const product = await this.prisma.product.create({
      data,
      include: {
        category: true,
        subCategory: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      } as any,
    });

    // Ensuite, créer les images si elles existent
    if (imageUrls && imageUrls.length > 0) {
      await (this.prisma as any).productImage.createMany({
        data: imageUrls.map((url, index) => ({
          productId: product.id,
          url,
          isMain: index === 0, // La première image est la principale
        })),
      });
    }

    // Créer les vidéos si elles existent
    if (videoUrls && videoUrls.length > 0) {
      await (this.prisma as any).productVideo.createMany({
        data: videoUrls.map((url) => ({
          productId: product.id,
          url,
        })),
      });
    }

    // Charger les images et vidéos
    const productImages = await (this.prisma as any).productImage.findMany({
      where: { productId: product.id },
      orderBy: { isMain: 'desc' },
    });

    const productVideos = await (this.prisma as any).productVideo.findMany({
      where: { productId: product.id },
    });

    return { ...product, images: productImages, videos: productVideos };
  }

  async findAll() {
    const products = await this.prisma.product.findMany({
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subCategory: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      } as any,
      orderBy: { createdAt: 'desc' },
    });
    
    // Charger les images et vidéos pour chaque produit
    const productsWithMedia = await Promise.all(
      products.map(async (product) => {
        const images = await (this.prisma as any).productImage.findMany({
          where: { productId: product.id },
          orderBy: { isMain: 'desc' },
        });
        
        const videos = await (this.prisma as any).productVideo.findMany({
          where: { productId: product.id },
        });
        
        return { ...product, images, videos };
      })
    );
    
    return productsWithMedia;
  }

  async findFeatured() {
    const products = await this.prisma.product.findMany({
      where: {
        isFeatured: true,
        isActive: true,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subCategory: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        promotions: {
          include: {
            promotion: true,
          },
          where: {
            promotion: {
              isActive: true,
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
          },
        },
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    // Charger les images, vidéos et la note maximale pour chaque produit
    const productsWithMedia = await Promise.all(
      products.map(async (product) => {
        const images = await (this.prisma as any).productImage.findMany({
          where: { productId: product.id },
          orderBy: { isMain: 'desc' },
        });

        const videos = await (this.prisma as any).productVideo.findMany({
          where: { productId: product.id },
        });

        // Récupérer la note maximale des avis approuvés
        const reviews = await (this.prisma as any).review.findMany({
          where: {
            productId: product.id,
            isApproved: true,
          },
          select: {
            rating: true,
          },
        });

        let maxRating = 0;
        if (reviews.length > 0) {
          maxRating = Math.max(...reviews.map((r: any) => r.rating));
        }

        return { ...product, images, videos, maxRating };
      }),
    );

    return productsWithMedia;
  }

  async findPublic(categoryId?: number, subCategoryId?: number, search?: string) {
    const where: any = {
      isActive: true,
    };

    // Filtrer par catégorie ou sous-catégorie si fourni
    if (subCategoryId) {
      where.subCategoryId = subCategoryId;
    } else if (categoryId) {
      where.categoryId = categoryId;
    }

    // Filtrer par recherche (nom ou description)
    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subCategory: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        promotions: {
          where: {
            promotion: {
              isActive: true,
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
          },
          include: {
            promotion: true,
          },
        },
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    // Charger les images, vidéos et la note maximale pour chaque produit
    const productsWithMedia = await Promise.all(
      products.map(async (product) => {
        const images = await (this.prisma as any).productImage.findMany({
          where: { productId: product.id },
          orderBy: { isMain: 'desc' },
        });

        const videos = await (this.prisma as any).productVideo.findMany({
          where: { productId: product.id },
        });

        // Récupérer la note maximale des avis approuvés
        const reviews = await (this.prisma as any).review.findMany({
          where: {
            productId: product.id,
            isApproved: true,
          },
          select: {
            rating: true,
          },
        });

        let maxRating = 0;
        if (reviews.length > 0) {
          maxRating = Math.max(...reviews.map((r: any) => r.rating));
        }

        return { ...product, images, videos, maxRating };
      }),
    );

    return productsWithMedia;
  }

  async findOnePublic(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id, isActive: true },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subCategory: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        promotions: {
          where: {
            promotion: {
              isActive: true,
              startDate: { lte: new Date() },
              endDate: { gte: new Date() },
            },
          },
          include: {
            promotion: true,
          },
        },
      } as any,
    });

    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${id} introuvable`);
    }

    // Charger les images et vidéos séparément
    const images = await (this.prisma as any).productImage.findMany({
      where: { productId: id },
      orderBy: { isMain: 'desc' },
    });

    const videos = await (this.prisma as any).productVideo.findMany({
      where: { productId: id },
    });

    // Récupérer les avis approuvés avec les informations utilisateur
    const reviews = await (this.prisma as any).review.findMany({
      where: {
        productId: id,
        isApproved: true,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Calculer la note moyenne et la note maximale
    let averageRating = 0;
    let maxRating = 0;
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc: number, review: any) => acc + review.rating, 0);
      averageRating = Math.round((sum / reviews.length) * 10) / 10; // Arrondir à 1 décimale
      maxRating = Math.max(...reviews.map((r: any) => r.rating));
    }

    return { ...product, images, videos, averageRating, maxRating, reviews, reviewsCount: reviews.length };
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subCategory: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      } as any,
    });

    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${id} introuvable`);
    }

    // Charger les images et vidéos séparément
    const images = await (this.prisma as any).productImage.findMany({
      where: { productId: id },
      orderBy: { isMain: 'desc' },
    });

    const videos = await (this.prisma as any).productVideo.findMany({
      where: { productId: id },
    });

    return { ...product, images, videos };
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    // Vérifier si le produit existe
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Produit avec l'ID ${id} introuvable`);
    }

    const { images: imageUrls, videos: videoUrls, categoryId, subCategoryId, ...restData } = updateProductDto as any;

    // Normaliser les valeurs : convertir 0, null, undefined en undefined
    const normalizedCategoryId = categoryId !== undefined ? (categoryId && categoryId > 0 ? categoryId : null) : undefined;
    const normalizedSubCategoryId = subCategoryId !== undefined ? (subCategoryId && subCategoryId > 0 ? subCategoryId : null) : undefined;

    // Déterminer les valeurs finales (en tenant compte des valeurs existantes si non modifiées)
    const finalCategoryId = normalizedCategoryId !== undefined ? normalizedCategoryId : (existing as any).categoryId;
    const finalSubCategoryId = normalizedSubCategoryId !== undefined ? normalizedSubCategoryId : (existing as any).subCategoryId;
    
    // Validation : le produit doit avoir au moins une catégorie
    if (!finalCategoryId) {
      throw new Error('Le produit doit avoir une catégorie');
    }

    // Si une sous-catégorie est fournie, vérifier qu'elle appartient à la catégorie sélectionnée
    if (finalSubCategoryId) {
      const subCategory = await this.prisma.subCategory.findUnique({
        where: { id: finalSubCategoryId },
        include: { category: true },
      });

      if (!subCategory) {
        throw new Error(`Sous-catégorie avec l'ID ${finalSubCategoryId} introuvable`);
      }

      if (subCategory.categoryId !== finalCategoryId) {
        throw new Error('La sous-catégorie sélectionnée n\'appartient pas à la catégorie choisie');
      }
    }

    // Préparer les données de mise à jour avec la syntaxe Prisma pour les relations
    const data: any = {
      ...restData,
    };

    // Gérer les relations avec la syntaxe Prisma
    if (normalizedCategoryId !== undefined) {
      if (normalizedCategoryId === null) {
        data.category = { disconnect: true };
      } else {
        data.category = { connect: { id: normalizedCategoryId } };
      }
    }

    if (normalizedSubCategoryId !== undefined) {
      if (normalizedSubCategoryId === null) {
        data.subCategory = { disconnect: true };
      } else {
        data.subCategory = { connect: { id: normalizedSubCategoryId } };
      }
    }

    // Si des images sont fournies, on les met à jour
    if (imageUrls !== undefined) {
      // Supprimer toutes les images existantes
      await (this.prisma as any).productImage.deleteMany({
        where: { productId: id },
      });

      // Créer les nouvelles images
      if (imageUrls.length > 0) {
        await (this.prisma as any).productImage.createMany({
          data: imageUrls.map((url, index) => ({
            productId: id,
            url,
            isMain: index === 0,
          })),
        });
      }
    }

    // Si des vidéos sont fournies, on les met à jour
    if (videoUrls !== undefined) {
      // Supprimer toutes les vidéos existantes
      await (this.prisma as any).productVideo.deleteMany({
        where: { productId: id },
      });

      // Créer les nouvelles vidéos
      if (videoUrls.length > 0) {
        await (this.prisma as any).productVideo.createMany({
          data: videoUrls.map((url) => ({
            productId: id,
            url,
          })),
        });
      }
    }

    // Mettre à jour le produit
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subCategory: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      } as any,
    });

    // Charger les images et vidéos séparément
    const productImages = await (this.prisma as any).productImage.findMany({
      where: { productId: id },
      orderBy: { isMain: 'desc' },
    });

    const productVideos = await (this.prisma as any).productVideo.findMany({
      where: { productId: id },
    });

    return { ...updatedProduct, images: productImages, videos: productVideos };
  }

  async remove(id: number) {
    // Vérifier si le produit existe
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Produit avec l'ID ${id} introuvable`);
    }

    // Les images seront supprimées automatiquement grâce à onDelete: Cascade
    return this.prisma.product.delete({
      where: { id },
    });
  }
}

