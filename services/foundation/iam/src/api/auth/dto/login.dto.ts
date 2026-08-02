import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@nafa.gn' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @MinLength(8)
  password!: string;
}
