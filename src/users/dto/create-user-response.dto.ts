export class CreateUserResponseDto {
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role: string;
  };
  generatedPassword: string;
  message?: string;
}
