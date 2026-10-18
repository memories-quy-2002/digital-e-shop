import type { ReactElement } from "react";
import { render as testingRender } from "@testing-library/react";
import { LocaleProvider } from "../context/LocaleContext";

export const renderWithLocale = (ui: ReactElement) =>
    testingRender(<LocaleProvider>{ui}</LocaleProvider>);
