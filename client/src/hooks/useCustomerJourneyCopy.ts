import { useLocale } from "../context/LocaleContext";
import { customerJourneyCopy } from "../i18n/customerJourneys";

export const useCustomerJourneyCopy = () => {
    const { locale } = useLocale();
    return customerJourneyCopy[locale];
};
