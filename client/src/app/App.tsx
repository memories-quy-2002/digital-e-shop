import AppProviders from "./providers";
import AppRouter from "../routes/router";
import ApiEnvironmentToggle from "../components/common/ApiEnvironmentToggle";

function App() {
    return (
        <AppProviders>
            {import.meta.env.DEV && <ApiEnvironmentToggle />}
            <AppRouter />
        </AppProviders>
    );
}

export default App;
