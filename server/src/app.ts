const express = require('express');
const cors = require('cors');
const PORT = process.env.PORT || 8080;
const app = express();
app.use(
	cors({
		origin: "http://localhost:3000",
		credentials: true,
	})
);
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}.`);
});

var msg: string = 'Hello World'
app.get('/', (req: any, res: { send: (arg0: string) => void; }) => {
    res.send(msg)
})