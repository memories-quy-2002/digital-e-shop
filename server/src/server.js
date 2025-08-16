require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 4000;

app.get('/', (req, res) => {
    res.send("Hello World from Express");
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});