import { Module } from "@nestjs/common";
import { ResendEmailService } from "./resend-email.service";

@Module({
    providers: [ResendEmailService],
    exports: [ResendEmailService],
})
export class EmailModule {}
