require("dotenv").config();
const app = require("./app");
import type { AppRequest, AppResponse } from "./types/domain";

const PORT = process.env.PORT || 4000;

app.get('/', (req: AppRequest, res: AppResponse) => {
    res.send("Hello World from Express");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
