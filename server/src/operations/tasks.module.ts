import { Module } from "@nestjs/common";
import { TasksRepository } from "./tasks.repository";
import { TasksService } from "./tasks.service";

@Module({ providers: [TasksRepository, TasksService], exports: [TasksService] })
export class TasksModule {}
