import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateFactDto } from './dto/create-fact.dto';
import { UpdateFactDto } from './dto/update-fact.dto';

const contactInclude = {
  facts: { orderBy: { createdAt: 'asc' as const } },
  tags: { include: { tag: true } },
} satisfies Prisma.ContactInclude;

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  private formatContact(contact: Prisma.ContactGetPayload<{ include: typeof contactInclude }>) {
    return {
      ...contact,
      tags: contact.tags.map((ct) => ct.tag),
    };
  }

  async findAll(userId: string, q?: string, tags?: string) {
    const where: Prisma.ContactWhereInput = { userId };

    if (q?.trim()) {
      const term = q.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (tags?.trim()) {
      const tagNames = tags.split(',').map((t) => t.trim()).filter(Boolean);
      for (const name of tagNames) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          { tags: { some: { tag: { name: { equals: name, mode: 'insensitive' } } } } },
        ];
      }
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      include: contactInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return contacts.map((c) => this.formatContact(c));
  }

  async findOne(userId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, userId },
      include: contactInclude,
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.formatContact(contact);
  }

  async create(userId: string, dto: CreateContactDto) {
    const contact = await this.prisma.contact.create({
      data: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        phone: dto.phone ?? null,
        socialUrl: dto.socialUrl?.trim() || null,
        description: dto.description?.trim() || null,
        tags: dto.tagIds?.length
          ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: contactInclude,
    });
    return this.formatContact(contact);
  }

  async update(userId: string, id: string, dto: UpdateContactDto) {
    await this.ensureOwned(userId, id);

    if (dto.tagIds !== undefined) {
      await this.prisma.contactTag.deleteMany({ where: { contactId: id } });
      if (dto.tagIds.length) {
        await this.prisma.contactTag.createMany({
          data: dto.tagIds.map((tagId) => ({ contactId: id, tagId })),
        });
      }
    }

    const contact = await this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.birthday !== undefined && {
          birthday: dto.birthday ? new Date(dto.birthday) : null,
        }),
        ...(dto.phone !== undefined && { phone: dto.phone ?? null }),
        ...(dto.socialUrl !== undefined && {
          socialUrl: dto.socialUrl?.trim() || null,
        }),
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
      },
      include: contactInclude,
    });
    return this.formatContact(contact);
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.contact.delete({ where: { id } });
  }

  async addFact(userId: string, contactId: string, dto: CreateFactDto) {
    await this.ensureOwned(userId, contactId);
    return this.prisma.fact.create({
      data: {
        contactId,
        type: dto.type,
        content: dto.content,
        reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
        reminderSent: false,
      },
    });
  }

  async updateFact(
    userId: string,
    contactId: string,
    factId: string,
    dto: UpdateFactDto,
  ) {
    await this.ensureOwned(userId, contactId);
    const fact = await this.prisma.fact.findFirst({
      where: { id: factId, contactId },
    });
    if (!fact) throw new NotFoundException('Fact not found');

    const reminderDateChanged =
      dto.reminderDate !== undefined &&
      (dto.reminderDate ?? null) !== (fact.reminderDate?.toISOString().slice(0, 10) ?? null);

    return this.prisma.fact.update({
      where: { id: factId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.reminderDate !== undefined && {
          reminderDate: dto.reminderDate ? new Date(dto.reminderDate) : null,
          ...(reminderDateChanged && { reminderSent: false }),
        }),
      },
    });
  }

  async removeFact(userId: string, contactId: string, factId: string) {
    await this.ensureOwned(userId, contactId);
    const fact = await this.prisma.fact.findFirst({
      where: { id: factId, contactId },
    });
    if (!fact) throw new NotFoundException('Fact not found');
    await this.prisma.fact.delete({ where: { id: factId } });
  }

  private async ensureOwned(userId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, userId },
    });
    if (!contact) throw new ForbiddenException('Contact not found');
    return contact;
  }
}
