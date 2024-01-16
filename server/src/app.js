const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const db = require("./database/models");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(bodyParser.json());
app.use(
	cors({
		origin: "http://localhost:3000",
		credentials: true,
	})
);

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});

app.get("/get/user", db.getUserLogin);
app.get("/get/user/:uid", db.getUserLoginById)
app.post("/post/signup", db.addUser);
app.post("/post/login", db.userLogin);
