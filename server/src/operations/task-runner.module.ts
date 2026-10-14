import { DynamicModule, Module, type Provider, type Type } from "@nestjs/common";
import { TasksModule } from "./tasks.module";
import { TaskRunnerController } from "./task-runner.controller";
import { TaskRunnerService } from "./task-runner.service";

@Module({ imports: [TasksModule], controllers: [TaskRunnerController], providers: [TaskRunnerService], exports: [TaskRunnerService] })
export class TaskRunnerModule {
    static register(options: { imports?: Array<Type<unknown> | DynamicModule>; providers?: Provider[] } = {}): DynamicModule {
        return {
            module: TaskRunnerModule,
            imports: options.imports || [],
            providers: options.providers || [],
        };
    }
}
