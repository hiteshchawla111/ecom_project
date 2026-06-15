import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes a password to something other than the plaintext', async () => {
    const hash = await svc.hash('s3cret!');
    expect(hash).not.toBe('s3cret!');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('compare returns true for the correct password', async () => {
    const hash = await svc.hash('s3cret!');
    await expect(svc.compare('s3cret!', hash)).resolves.toBe(true);
  });

  it('compare returns false for a wrong password', async () => {
    const hash = await svc.hash('s3cret!');
    await expect(svc.compare('nope', hash)).resolves.toBe(false);
  });
});
