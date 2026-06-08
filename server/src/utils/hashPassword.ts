const bcrypt = require("bcryptjs");
import { logger } from "#src/shared/utils/logger";

const saltRounds = 10;
export const hashPassword = async (password: string): Promise<string> => {
	try {
		const salt = await bcrypt.genSalt(saltRounds);
		const hash = await bcrypt.hash(password, salt);
		return hash;
	} catch (err) {
		logger.error(err);
		return " ";
	}
};

export const checkPassword = async (password: string, hashedPassword: string): Promise<boolean | undefined> => {
	try {
		const match = await bcrypt.compare(password, hashedPassword);
		return match;
	} catch (err) {
		logger.error(err);
	}
};

module.exports = {
	hashPassword,
	checkPassword,
};
