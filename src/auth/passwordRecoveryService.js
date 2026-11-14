import { API_ENDPOINTS } from '../Config/api.js';

export const requestPasswordReset = async (email) => {
  const response = await fetch(API_ENDPOINTS.passwordRecovery, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({ email: email.trim() }),
  });

  if (response.status !== 202) {
    throw new Error('Unable to process the request right now. Please try again.');
  }
};

export const resetPassword = async (token, newPassword) => {
  const response = await fetch(API_ENDPOINTS.passwordReset, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({ token, newPassword }),
  });

  if (response.status === 400) {
    const error = new Error('This password reset link is invalid or expired. Request a new one.');
    error.code = 'invalid-reset-link';
    throw error;
  }

  if (response.status !== 204) {
    throw new Error('Unable to reset your password right now. Please try again.');
  }
};
