import type { Request, Response } from "express";
const inventoryMovementService = require("../services/inventoryMovementService");

async function getInventoryMovements(req: Request, res: Response) {
    try {
        const movements = await inventoryMovementService.getMovements(req.query.limit);
        return res.status(200).json({ movements, msg: "Inventory movements retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Unable to load inventory movements" });
    }
}

module.exports = {
    getInventoryMovements,
};
