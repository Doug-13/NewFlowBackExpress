export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  accountId: string;
  name: string;
  email: string;
  password: string;
  role?: string;
}

export interface JwtUserPayload {
  sub: string;
  email: string;
  role: string;
  accountId: string;
  name: string;
}
