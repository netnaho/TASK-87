import apiClient from './client';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
  phoneMasked?: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export const authApi = {
  login: (data: LoginPayload) =>
    apiClient.post<{ success: boolean; data: AuthResponse }>('/auth/login', data),

  register: (data: LoginPayload & { displayName: string }) =>
    apiClient.post<{ success: boolean; data: AuthResponse }>('/auth/register', data),

  me: () =>
    apiClient.get<{ success: boolean; data: User }>('/auth/me'),
};
