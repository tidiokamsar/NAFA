import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@nafa.gn' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @MinLength(8)
  password!: string;
}
