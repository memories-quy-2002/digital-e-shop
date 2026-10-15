import { Global, Module } from "@nestjs/common";
import { OrderEmailRepository } from "./order-email.repository";
import { OrderEmailService } from "./order-email.service";

@Global() @Module({ providers: [OrderEmailRepository, OrderEmailService], exports: [OrderEmailService] })
export class OrderEmailModule {}
