import { Injectable, BadRequestException } from "@nestjs/common";
import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { getValidationMessage, parseBody } from "#src/shared/validation/requestSchemas";

@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
    constructor(private readonly schema: T) {}

    transform(value: unknown): z.infer<T> {
        try {
            return parseBody(this.schema, value);
        } catch (err) {
            // Pass an explicit body so the response matches the existing controllers'
            // { msg: ... } validation-error shape, not Nest's default
            // { statusCode, message, error } BadRequestException body.
            throw new BadRequestException({ msg: getValidationMessage(err) });
        }
    }
}
