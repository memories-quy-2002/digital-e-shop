import { BaseService } from "#src/core/base/BaseService";
import { NotFoundError } from "#src/core/errors/NotFoundError";
import { usersRepository } from "./users.repository";
import type { UpdateUserAdminInput } from "./users.dto";

class UsersService extends BaseService {
    async getUserById(uid: string) {
        return this.ensureFound(await usersRepository.findById(uid), "User not found");
    }

    async getAllUsers() {
        return usersRepository.getAll();
    }

    async getAllUsersPaginated(limit: number, offset: number) {
        return usersRepository.getPaginated(limit, offset);
    }

    async getUsersCount() {
        return usersRepository.getCount();
    }

    async updateUserAdmin(uid: string, { role, status }: UpdateUserAdminInput) {
        const result = await usersRepository.updateUserAdmin(uid, role, status);
        if (result.affectedRows === 0) {
            throw new NotFoundError("User not found");
        }

        return this.getUserById(uid);
    }

    async getCustomerProfile(uid: string) {
        const [profile, recentOrders] = await Promise.all([
            usersRepository.getCustomerProfile(uid),
            usersRepository.getCustomerRecentOrders(uid),
        ]);

        if (!profile) {
            return null;
        }

        return {
            ...profile,
            order_count: Number(profile.order_count) || 0,
            total_spent: Number(profile.total_spent) || 0,
            wishlist_count: Number(profile.wishlist_count) || 0,
            recent_orders: recentOrders.map((order) => ({
                ...order,
                total_price: Number(order.total_price) || 0,
                discount: Number(order.discount) || 0,
            })),
        };
    }
}

export const usersService = new UsersService();

