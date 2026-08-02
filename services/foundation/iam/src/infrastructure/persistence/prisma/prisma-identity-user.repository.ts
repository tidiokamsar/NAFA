import { Injectable } from '@nestjs/common';
import type { IdentityUser, IdentityUserRepository } from '../../../domain';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaIdentityUserRepository implements IdentityUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<IdentityUser | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<IdentityUser | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(email: string, passwordHash: string): Promise<IdentityUser> {
    return this.prisma.user.create({ data: { email, passwordHash } });
  }
}
