declare module "passport-custom" {
  import type { Request } from "express";
  import type { Strategy as PassportStrategy } from "passport";

  type VerifyFunction = (
    req: Request,
    done: (error: unknown, user?: Express.User | false | null, info?: unknown) => void,
  ) => void;

  export class Strategy implements PassportStrategy {
    name: string;
    constructor(verify: VerifyFunction);
    authenticate(req: Request, options?: unknown): void;
  }
}
