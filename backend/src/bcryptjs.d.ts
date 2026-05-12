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