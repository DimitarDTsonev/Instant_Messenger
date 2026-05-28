/**
 * Minimal ambient type declaration for `bcryptjs`.
 *
 * This project ships its own declaration file rather than using
 * `@types/bcryptjs` to keep the dependency surface small.  Only the three
 * functions used in the auth layer are declared here.
 *
 * Used by: backend/src/routes/auth.ts (password hashing and comparison).
 */
declare module "bcryptjs" {
  export function hash(password: string, saltOrRounds: number): Promise<string>;
  export function hashSync(password: string, saltOrRounds: number): string;
  export function compareSync(password: string, hash: string): boolean;

  const bcrypt: {
    hash: typeof hash;
    hashSync: typeof hashSync;
    compareSync: typeof compareSync;
  };

  export default bcrypt;
}