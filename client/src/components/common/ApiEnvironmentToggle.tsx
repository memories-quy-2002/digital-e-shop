import { useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { API_ENVIRONMENT, API_ENVIRONMENT_STORAGE_KEY, API_ENVIRONMENT_TOGGLE_ENABLED, type ApiEnvironment } from "../../lib/env";

function ApiEnvironmentToggle() {
    const { t } = useLocale();
    const [storageError, setStorageError] = useState(false);

    if (!API_ENVIRONMENT_TOGGLE_ENABLED) return null;

    const selectedEnvironment = API_ENVIRONMENT;

    const changeEnvironment = (environment: ApiEnvironment) => {
        try {
            window.sessionStorage.setItem(API_ENVIRONMENT_STORAGE_KEY, environment);
            window.location.reload();
        } catch {
            setStorageError(true);
        }
    };

    return (
        <aside className={`api-environment-toggle${selectedEnvironment === "production" ? " is-production" : ""}`} aria-label={t.common.apiEnvironment}>
            <label className="api-environment-toggle__control">
                <span>{t.common.apiEnvironment}</span>
                <select
                    aria-label={t.common.apiEnvironment}
                    value={selectedEnvironment}
                    onChange={(event) => changeEnvironment(event.target.value as ApiEnvironment)}
                >
                    <option value="local">{t.common.apiLocal}</option>
                    <option value="production">{t.common.apiProduction}</option>
                </select>
            </label>
            <p role="status">
                {selectedEnvironment === "production" ? t.common.apiProductionWarning : t.common.apiLocalHint}
            </p>
            {storageError && <p className="api-environment-toggle__error" role="alert">{t.common.apiEnvironmentStorageError}</p>}
        </aside>
    );
}

export default ApiEnvironmentToggle;
