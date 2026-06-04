import type { AppRequest, AppResponse } from "#src/shared/interfaces/domain";
const inventoryMovementService = require("./inventory.service");
const { inventoryMovementsQuerySchema } = require("./inventory.validator");
const { getValidationMessage, parseBody } = require("#src/shared/validation/requestSchemas");

async function getInventoryMovements(req: AppRequest, res: AppResponse) {
    try {
        const { limit } = parseBody(inventoryMovementsQuerySchema, req.query);
        const movements = await inventoryMovementService.getMovements(limit);
        return res.status(200).json({ movements, msg: "Inventory movements retrieved successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        console.error(err);
        return res.status(500).json({ msg: "Unable to load inventory movements" });
    }
}

module.exports = {
    getInventoryMovements,
};

