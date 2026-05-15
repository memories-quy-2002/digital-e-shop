const bcrypt = require("bcryptjs");

const saltRounds = 10;
const hashPassword = async (password: string): Promise<string> => {
	try {
		const salt = await bcrypt.genSalt(saltRounds);
		const hash = await bcrypt.hash(password, salt);
		return hash;
	} catch (err) {
		console.error(err);
		return " ";
	}
};

const checkPassword = async (password: string, hashedPassword: string): Promise<boolean | undefined> => {
	try {
		const match = await bcrypt.compare(password, hashedPassword);
		return match;
	} catch (err) {
		console.error(err);
	}
};

module.exports = {
	hashPassword,
	checkPassword,
};
