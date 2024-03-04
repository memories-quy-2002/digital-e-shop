const bcrypt = require("bcrypt");

const saltRounds = 10;
const hashPassword = async (password) => {
	try {
		const salt = await bcrypt.genSalt(saltRounds);
		const hash = await bcrypt.hash(password, salt);
		return hash;
	} catch (err) {
		console.error(err);
		return " ";
	}
};

const checkPassword = async (password, hashedPassword) => {
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
