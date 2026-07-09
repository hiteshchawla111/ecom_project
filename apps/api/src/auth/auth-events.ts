/** Fired after a user successfully registers (post-commit). Consumed by notifications. */
export const AUTH_REGISTERED = 'auth.registered';

export interface AuthRegisteredEvent {
  userId: string;
}
