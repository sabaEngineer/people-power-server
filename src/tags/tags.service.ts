import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class TagsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.tag.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async create(userId: string, dto: CreateTagDto) {
    return this.prisma.tag.upsert({
      where: {
        userId_name: { userId, name: dto.name.trim() },
      },
      update: {},
      create: { userId, name: dto.name.trim() },
    });
  }

  async remove(userId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id, userId } });
    if (!tag) throw new NotFoundException('Tag not found');
    await this.prisma.tag.delete({ where: { id } });
  }
}
