import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  IDENTITY_USER_REPOSITORY,
  type IdentityUserRepository,
} from '../../domain';

export interface AuthTokens {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_USER_REPOSITORY)
    private readonly users: IdentityUserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.users.create(email, passwordHash);
    return this.issueToken(user.id, user.email);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueToken(user.id, user.email);
  }

  private issueToken(sub: string, email: string): AuthTokens {
    return { accessToken: this.jwtService.sign({ sub, email }) };
  }
}
