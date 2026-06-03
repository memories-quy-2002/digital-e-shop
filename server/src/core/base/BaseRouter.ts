import { Router } from "express";

export class BaseRouter {
    protected readonly router = Router();

    public build() {
        return this.router;
    }
}
