require("dotenv").config();
const app = require("./app");
import type { Request, Response } from "express";

const PORT = process.env.PORT || 4000;

app.get('/', (req: Request, res: Response) => {
    res.send("Hello World from Express");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
