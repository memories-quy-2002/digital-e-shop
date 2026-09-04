import { Injectable, NotFoundException } from "@nestjs/common";
import { UsersRepository } from "./users.repository";
import type { UpdateUserAdminInput } from "./users.dto";

@Injectable()
export class NestUsersService {
    constructor(private readonly usersRepository: UsersRepository) {}

    async getUserById(uid: string) {
        const user = await this.usersRepository.findById(uid);
        if (!user) throw new NotFoundException({ msg: "User not found" });
        return user;
    }

    async getAllUsers() {
        return this.usersRepository.getAll();
    }

    async getAllUsersPaginated(limit: number, offset: number) {
        return this.usersRepository.getPaginated(limit, offset);
    }

    async getUsersCount() {
        return this.usersRepository.getCount();
    }

    async updateUserAdmin(uid: string, { role, status }: UpdateUserAdminInput) {
        const result = await this.usersRepository.updateUserAdmin(uid, role, status);
        if (result.affectedRows === 0) {
            throw new NotFoundException({ msg: "User not found" });
        }

        return this.getUserById(uid);
    }

    async getCustomerProfile(uid: string) {
        const [profile, recentOrders] = await Promise.all([
            this.usersRepository.getCustomerProfile(uid),
            this.usersRepository.getCustomerRecentOrders(uid),
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
