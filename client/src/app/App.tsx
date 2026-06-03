import AppProviders from "./providers";
import AppRouter from "../routes/router";

function App() {
    return (
        <AppProviders>
            <AppRouter />
        </AppProviders>
    );
}

export default App;
