import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueryEducationArticlesDto } from './dto/query-education-articles.dto.js';

const articleListSelect = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  trimester: true,
  category: true,
  source_name: true,
  source_url: true,
  reviewer: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.EducationArticleSelect;

@Injectable()
export class EducationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryEducationArticlesDto) {
    const where: Prisma.EducationArticleWhereInput = {
      published: true,
      ...(query.trimester && { trimester: query.trimester }),
      ...(query.category && {
        category: { equals: query.category, mode: 'insensitive' },
      }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { summary: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.educationArticle.findMany({
        where,
        select: articleListSelect,
        orderBy: [{ trimester: 'asc' }, { created_at: 'desc' }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.educationArticle.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async findOne(slug: string) {
    const article = await this.prisma.educationArticle.findFirst({
      where: { slug, published: true },
    });

    if (!article) {
      throw new NotFoundException('Artikel edukasi tidak ditemukan');
    }

    return article;
  }
}
