import { API_ENDPOINTS } from '../Config/api.js';

export const requestPasswordReset = async (email) => {
  const response = await fetch(API_ENDPOINTS.passwordRecovery, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ email: email.trim() }),
  });

  if (!response.ok) {
    throw new Error('Unable to process the request right now. Please try again.');
  }
};

export const resetPassword = async (token, newPassword) => {
  const response = await fetch(API_ENDPOINTS.passwordReset, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ token, newPassword }),
  });

  if (!response.ok) {
    throw new Error('This password reset link is invalid or expired. Request a new one.');
  }
};
