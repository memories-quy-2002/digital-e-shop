export interface IBaseRepository<TEntity, TId = string, TCreateInput = Partial<TEntity>, TUpdateInput = Partial<TEntity>> {
    findById(id: TId): Promise<TEntity | null>;
    findMany(...args: unknown[]): Promise<TEntity[]>;
    create(data: TCreateInput): Promise<TEntity>;
    update(id: TId, data: TUpdateInput): Promise<TEntity>;
    delete(id: TId): Promise<void>;
}
